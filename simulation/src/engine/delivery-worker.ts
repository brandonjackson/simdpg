import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { deliver, type EventOutcome } from "./delivery.js";
import { DELIVERY_QUEUE_NAME, type DeliveryJob } from "./delivery-queue.js";
import {
  createRedis,
  redisUrlFromEnv,
  runCounterKey,
  runStoppedKey,
  type RunCounters,
} from "./redis.js";
import { log, logError } from "../utils.js";

/**
 * The consumer side of the delivery pool: a long-lived, stateless process that
 * pops delivery jobs and POSTs them.
 *
 * See docs/specs/2026-07-19-queued-event-delivery-design.md. This process
 * deliberately holds no run state and **never writes SQLite** — N workers
 * contending on one writer would reintroduce the `SQLITE_BUSY` stalls the queue
 * exists to avoid. Outcomes go to Redis counters, which the scheduler flushes
 * to the `simulation_runs` row.
 */

/**
 * Deliveries a single worker process runs at once. High because the work is
 * almost entirely waiting on remote webhooks: a delivery is one `fetch`, so
 * hundreds in flight cost sockets and promises rather than CPU. Total pool
 * throughput is replicas × this.
 */
export const DEFAULT_WORKER_CONCURRENCY = 200;

/** Per-worker concurrency; override with SIM_WORKER_CONCURRENCY. */
export function concurrencyFromEnv(): number {
  const raw = Number.parseInt(process.env.SIM_WORKER_CONCURRENCY ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WORKER_CONCURRENCY;
}

export interface HandlerDeps {
  fetch: typeof fetch;
  /** Redis counters. Only INCR and EXISTS are used — never a SQLite handle. */
  counters: RunCounters;
  /** Per-POST abort timeout in ms; forwarded to `deliver`. */
  timeoutMs?: number;
}

/**
 * Handle one delivery job: deliver the event, then record the outcome.
 *
 * Returns the outcome so BullMQ stores something legible for debugging. Never
 * throws for a delivery failure — a failed POST is a counted outcome, not a job
 * failure, so BullMQ must not retry it.
 */
export async function handleDeliveryJob(
  job: DeliveryJob,
  deps: HandlerDeps,
): Promise<EventOutcome> {
  const { simulationId, event } = job;

  // A stopped run may still have thousands of jobs queued behind it. Skipping
  // them here — rather than draining them into POSTs — is what makes a stop
  // take effect promptly across the whole pool.
  const outcome = (await deps.counters.exists(runStoppedKey(simulationId)))
    ? "skipped"
    : await deliver(event, { fetch: deps.fetch, timeoutMs: deps.timeoutMs });

  // Counter increments are the worker's only durable output. A failure to
  // record must not fail the job: the event was already POSTed, so retrying
  // would duplicate it. The run's totals under-count instead, which the
  // scheduler's terminal write reconciles.
  try {
    await deps.counters.incr(runCounterKey(simulationId, outcome));
  } catch (err) {
    logError(`Counter INCR failed for ${simulationId} (${outcome})`, err);
  }

  return outcome;
}

export interface WorkerOptions {
  /** Connection BullMQ consumes the queue on. */
  connection?: Redis;
  /**
   * Connection the counter INCRs run on. Separate from `connection` by default:
   * BullMQ occupies its connection with blocking commands, so sharing one would
   * queue every INCR behind a `BRPOPLPUSH` wait.
   */
  counters?: RunCounters;
  concurrency?: number;
}

/** Start the BullMQ worker. The returned worker consumes until `close()`d. */
export function startDeliveryWorker(options: WorkerOptions = {}): Worker<DeliveryJob, EventOutcome> {
  const connection = options.connection ?? createRedis();
  const counters = options.counters ?? createRedis();
  const concurrency = options.concurrency ?? concurrencyFromEnv();

  const worker = new Worker<DeliveryJob, EventOutcome>(
    DELIVERY_QUEUE_NAME,
    (job: Job<DeliveryJob>) => handleDeliveryJob(job.data, { fetch, counters }),
    { connection, concurrency },
  );

  // `deliver()` never throws, so this only fires on infrastructure faults
  // (Redis dropped, job data unparseable). Log rather than exit: one bad job
  // must not take a worker serving every run in the pool down with it.
  worker.on("failed", (job, err) => {
    logError(`Delivery job ${job?.id ?? "?"} failed`, err);
  });

  return worker;
}

/**
 * Worker process entry point. Runs until SIGTERM/SIGINT, then closes the worker
 * so in-flight deliveries finish before the process exits.
 */
export async function runDeliveryWorker(): Promise<void> {
  const concurrency = concurrencyFromEnv();
  const worker = startDeliveryWorker({ concurrency });
  log(`Delivery worker: consuming ${DELIVERY_QUEUE_NAME} at ${redisUrlFromEnv()} (concurrency ${concurrency})`);

  await new Promise<void>((resolve) => {
    const shutdown = (signal: string) => {
      log(`Delivery worker: ${signal} received, draining in-flight deliveries...`);
      // `close()` stops pulling new jobs and waits for active ones to settle.
      worker.close().then(() => resolve(), (err) => {
        logError("Delivery worker shutdown", err);
        resolve();
      });
    };
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  });

  log("Delivery worker: stopped");
}
