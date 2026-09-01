import { Worker, type Job } from "bullmq";
import type Redis from "ioredis";
import { deliver, type EventOutcome } from "./delivery.js";
import { DELIVERY_QUEUE, counterKey, type DeliveryJob } from "./queue.js";
import { createRedis, redisUrl } from "./redis.js";
import { log, logError } from "../utils.js";

/** Jobs processed simultaneously per worker; override with SIM_WORKER_CONCURRENCY.
 * High because the work is almost entirely waiting on remote webhooks — a
 * delivery is one fetch, so hundreds in flight cost sockets, not CPU. Pool
 * throughput is replicas × this. */
export const DEFAULT_WORKER_CONCURRENCY = 200;

export function concurrencyFromEnv(): number {
  const raw = Number.parseInt(process.env.SIM_WORKER_CONCURRENCY ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WORKER_CONCURRENCY;
}

/** What handling one job needs: an HTTP client to POST with, a per-POST timeout,
 * and a Redis handle to tally the outcome. Injected so the handler unit-tests
 * without a real queue or server. */
export interface JobHandlerDeps {
  fetch: typeof fetch;
  timeoutMs?: number;
  redis: Pick<Redis, "incr">;
}

/**
 * Deliver one job and tally the outcome. `deliver()` never throws — a failed
 * POST is a counted business outcome, not a job error — so this returns
 * normally on all three outcomes and the BullMQ job is marked completed.
 * BullMQ's redelivery is reserved for a crashed worker (stalled job), not for
 * HTTP failures, which would otherwise double-count.
 */
export async function handleDeliveryJob(
  data: DeliveryJob,
  deps: JobHandlerDeps,
): Promise<EventOutcome> {
  const outcome = await deliver(data.event, { fetch: deps.fetch, timeoutMs: deps.timeoutMs });
  // A failed INCR must not fail the job: the event was already POSTed, so a
  // retry would duplicate it. Under-count instead — the scheduler's terminal
  // write reconciles the totals.
  try {
    await deps.redis.incr(counterKey(data.simulationId, outcome));
  } catch (err) {
    logError(`Counter INCR failed for ${data.simulationId} (${outcome})`, err);
  }
  return outcome;
}

export interface StartWorkerOptions {
  /** Connection BullMQ consumes the queue on. Defaults to a fresh one. */
  connection?: Redis;
  /** Connection the counter INCRs run on. Separate from `connection` by default:
   * BullMQ occupies its connection with blocking commands, so sharing one would
   * queue every INCR behind a BRPOPLPUSH wait. */
  counters?: Redis;
  concurrency?: number;
}

/**
 * Construct and start the BullMQ worker. Returns the `Worker` (consuming until
 * `close()`d) so callers — tests and the process entry alike — own its
 * lifecycle. Connections default to fresh ones but can be injected.
 */
export function startDeliveryWorker(options: StartWorkerOptions = {}): Worker<DeliveryJob, EventOutcome> {
  const connection = options.connection ?? createRedis();
  const counters = options.counters ?? createRedis();
  const concurrency = options.concurrency ?? concurrencyFromEnv();

  const worker = new Worker<DeliveryJob, EventOutcome>(
    DELIVERY_QUEUE,
    (job: Job<DeliveryJob>) => handleDeliveryJob(job.data, { fetch, redis: counters }),
    { connection, concurrency },
  );

  worker.on("ready", () => log(`Delivery worker ready (concurrency ${concurrency})`));
  // deliver() never throws, so this only fires on infrastructure faults. Log
  // rather than exit: one bad job must not take down a worker serving the pool.
  worker.on("failed", (job, err) => logError(`Delivery job ${job?.id ?? "?"} failed`, err));

  return worker;
}

/**
 * Worker process entry point. Runs until SIGTERM/SIGINT, then drains in-flight
 * deliveries and closes both connections. BullMQ never closes a connection it's
 * handed, so the worker owns and quits them — otherwise the open sockets keep
 * the event loop alive and the process hangs on shutdown.
 */
export async function runDeliveryWorker(): Promise<void> {
  const connection = createRedis();
  const counters = createRedis();
  const worker = startDeliveryWorker({ connection, counters });
  log(`Delivery worker: consuming ${DELIVERY_QUEUE} at ${redisUrl()}`);

  await new Promise<void>((resolve) => {
    const shutdown = (signal: string) => {
      log(`Delivery worker: ${signal} received, draining in-flight deliveries...`);
      resolve();
    };
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  });

  await worker.close();
  await connection.quit();
  await counters.quit();
  log("Delivery worker: stopped");
}
