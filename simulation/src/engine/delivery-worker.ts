/**
 * The delivery pool: a long-lived, stateless worker process. N replicas of this
 * run behind one queue and serve every simulation run — jobs carry their own
 * `simulationId`, so a worker holds no per-run state and needs no volume.
 *
 * The job handler is `deliver()` from the scheduler, unchanged: same abort
 * timeout, same null-targetUrl skip, same never-throws contract. All this file
 * adds around it is the stop-flag check and the counter INCR.
 */

import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { deliver, DEFAULT_TIMEOUT_MS, type EventOutcome } from "./scheduler.js";
import {
  createRedis,
  incrementOutcome,
  isRunStopped,
  queueName,
  workerConcurrency,
  type DeliveryJob,
} from "./queue.js";
import { log, logError } from "../utils.js";

export interface DeliveryPoolOptions {
  /** Defaults to SIM_QUEUE_NAME / sim:deliveries. */
  queue?: string;
  /** Defaults to SIM_WORKER_CONCURRENCY / 200. */
  concurrency?: number;
  /** Per-POST abort timeout. Defaults to SIM_DELIVERY_TIMEOUT_MS / 15s. */
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Redis URL for both connections. Defaults to REDIS_URL. */
  redisUrl?: string;
}

export interface DeliveryPool {
  /** Jobs this particular worker handled — used to prove the pool spread work. */
  processed(): number;
  close(): Promise<void>;
}

function timeoutFromEnv(): number {
  const raw = Number.parseInt(process.env.SIM_DELIVERY_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/**
 * Start consuming deliveries. Returns immediately; the worker runs until close().
 *
 * Two Redis connections on purpose: BullMQ's blocks on the queue, so counter
 * writes get their own client rather than queueing behind a blocking read.
 */
export function startDeliveryPool(options: DeliveryPoolOptions = {}): DeliveryPool {
  const concurrency = options.concurrency ?? workerConcurrency();
  const timeoutMs = options.timeoutMs ?? timeoutFromEnv();
  const fetchImpl = options.fetchImpl ?? fetch;
  const connection: Redis = createRedis(options.redisUrl);
  const counters: Redis = createRedis(options.redisUrl);

  let processed = 0;

  const handle = async (job: Job<DeliveryJob>): Promise<EventOutcome> => {
    const { simulationId, event } = job.data;
    processed += 1;

    // A stopped run's jobs may already be queued; drop them rather than POST.
    // Costs one Redis GET per job — measurable only if the queue itself is the
    // bottleneck, which the design says it is not at this phase's rates.
    if (await isRunStopped(counters, simulationId)) {
      await incrementOutcome(counters, simulationId, "skipped");
      return "skipped";
    }

    const outcome = await deliver(event, {
      now: Date.now,
      sleep: async () => {},
      fetch: fetchImpl,
      shouldStop: () => false,
      timeoutMs,
    });
    await incrementOutcome(counters, simulationId, outcome);
    return outcome;
  };

  const worker = new Worker<DeliveryJob, EventOutcome>(
    options.queue ?? queueName(),
    handle,
    { connection, concurrency },
  );

  // deliver() never throws, so a job that fails here means Redis or the handler
  // itself broke. Log it — BullMQ redelivers after the stalled-job interval.
  worker.on("failed", (job, err) => {
    logError(`delivery job ${job?.id ?? "?"} failed`, err);
  });
  worker.on("error", (err) => logError("delivery worker error", err));

  return {
    processed: () => processed,
    close: async () => {
      await worker.close();
      connection.disconnect();
      counters.disconnect();
    },
  };
}

/**
 * Entry point for the `sim-worker` container (`node dist/index.js worker`).
 * Blocks until SIGTERM/SIGINT, then drains in-flight jobs before exiting so a
 * compose restart doesn't strand deliveries mid-POST.
 */
export async function runDeliveryPool(): Promise<void> {
  const concurrency = workerConcurrency();
  const pool = startDeliveryPool();
  log(`Delivery worker ready: queue ${queueName()}, concurrency ${concurrency}`);

  await new Promise<void>((resolve) => {
    const shutdown = (signal: string): void => {
      log(`Delivery worker: ${signal} — draining ${pool.processed()} jobs handled`);
      resolve();
    };
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  });

  await pool.close();
}
