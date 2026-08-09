/**
 * Redis/BullMQ wiring shared by the scheduler (one process per run, publishes)
 * and the delivery pool (N long-lived containers, consume).
 *
 * See docs/specs/2026-07-19-queued-event-delivery-design.md. Only three kinds of
 * key exist:
 *
 *   sim:deliveries                   the work queue (BullMQ owns its own keys)
 *   sim:run:<id>:{delivered,…}       per-run outcome counters, INCRed by workers
 *   sim:run:<id>:stopped             stop flag, set by the scheduler on SIGTERM
 *
 * Workers deliberately never touch SQLite — N processes contending on one
 * writer is exactly the bottleneck the pool exists to avoid. The scheduler
 * flushes these counters to `simulation_runs` on a timer instead.
 */

import IORedis, { type Redis } from "ioredis";
import type { SimulationEvent } from "./events.js";
import type { EventOutcome } from "./scheduler.js";

export const DEFAULT_QUEUE_NAME = "sim:deliveries";
export const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";
/** Jobs a single worker process handles at once. Pool concurrency = replicas × this. */
export const DEFAULT_WORKER_CONCURRENCY = 200;
/**
 * Counters and stop flags are debugging aids once a run is over, not state the
 * portal reads (that lives in SQLite), so they expire rather than accumulate.
 */
export const RUN_KEY_TTL_SECONDS = 24 * 60 * 60;

/** What a worker receives: the full event, so workers need no SIM_DATA_DIR volume. */
export interface DeliveryJob {
  simulationId: string;
  event: SimulationEvent;
}

export interface RunCounters {
  delivered: number;
  skipped: number;
  failed: number;
}

const OUTCOMES: EventOutcome[] = ["delivered", "skipped", "failed"];

export function redisUrl(): string {
  return process.env.REDIS_URL?.trim() || DEFAULT_REDIS_URL;
}

/**
 * Queued delivery is on exactly when REDIS_URL is set. Unset — plain `npm run
 * dev`, and Railway, where there is no Redis — the scheduler keeps delivering
 * in-process as it always has.
 */
export function queueingEnabled(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

/** Overridable so tests can run against a real Redis without colliding. */
export function queueName(): string {
  return process.env.SIM_QUEUE_NAME?.trim() || DEFAULT_QUEUE_NAME;
}

export function workerConcurrency(): number {
  const raw = Number.parseInt(process.env.SIM_WORKER_CONCURRENCY ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WORKER_CONCURRENCY;
}

/**
 * A Redis client BullMQ can use. `maxRetriesPerRequest: null` is required by
 * BullMQ — its blocking reads (BRPOPLPUSH) outlive any per-request retry budget
 * and ioredis otherwise kills them.
 */
export function createRedis(url: string = redisUrl()): Redis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export function counterKey(simulationId: string, outcome: EventOutcome): string {
  return `sim:run:${simulationId}:${outcome}`;
}

export function stopKey(simulationId: string): string {
  return `sim:run:${simulationId}:stopped`;
}

/**
 * Zero the counters and clear any stale stop flag before a run publishes.
 *
 * Setting the keys up front with a TTL is what keeps workers to a single `INCR`
 * per job: INCR preserves an existing key's TTL, so the hot path never has to
 * re-arm expiry.
 */
export async function resetRunCounters(redis: Redis, simulationId: string): Promise<void> {
  const tx = redis.multi();
  for (const outcome of OUTCOMES) {
    tx.set(counterKey(simulationId, outcome), 0, "EX", RUN_KEY_TTL_SECONDS);
  }
  tx.del(stopKey(simulationId));
  await tx.exec();
}

/** Aggregate outcome counts across the whole pool for one run. */
export async function readRunCounters(redis: Redis, simulationId: string): Promise<RunCounters> {
  const values = await redis.mget(OUTCOMES.map((o) => counterKey(simulationId, o)));
  const [delivered, skipped, failed] = values.map((v) => Number.parseInt(v ?? "0", 10) || 0);
  return { delivered, skipped, failed };
}

/** Record one delivery outcome. One Redis op — the pool's whole write path. */
export async function incrementOutcome(
  redis: Redis,
  simulationId: string,
  outcome: EventOutcome,
): Promise<void> {
  await redis.incr(counterKey(simulationId, outcome));
}

export async function markRunStopped(redis: Redis, simulationId: string): Promise<void> {
  await redis.set(stopKey(simulationId), "1", "EX", RUN_KEY_TTL_SECONDS);
}

export async function isRunStopped(redis: Redis, simulationId: string): Promise<boolean> {
  return (await redis.exists(stopKey(simulationId))) === 1;
}
