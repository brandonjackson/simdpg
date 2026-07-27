import IORedis, { type Redis } from "ioredis";

/**
 * Redis wiring shared by the scheduler and the delivery workers.
 *
 * See docs/specs/2026-07-19-queued-event-delivery-design.md. Redis holds the
 * delivery queue and the per-run counters; it is deliberately the *only*
 * coordination point workers touch, so a worker needs a `REDIS_URL` and
 * nothing else — no `SIM_DATA_DIR`, no volume, no SQLite handle.
 */

export const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

/** Connection string from the environment, falling back to a local Redis. */
export function redisUrlFromEnv(): string {
  const raw = process.env.REDIS_URL?.trim();
  return raw ? raw : DEFAULT_REDIS_URL;
}

/**
 * Open a Redis connection suitable for BullMQ.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ's blocking commands — with
 * the ioredis default, a blocking `BRPOPLPUSH` is torn down mid-wait.
 */
export function createRedis(url: string = redisUrlFromEnv()): Redis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}

/** The counters a run accumulates in Redis, one per delivery outcome. */
export type RunCounterName = "delivered" | "skipped" | "failed";

/** Key for one of a run's outcome counters, e.g. `sim:run:abc:delivered`. */
export function runCounterKey(simulationId: string, counter: RunCounterName): string {
  return `sim:run:${simulationId}:${counter}`;
}

/** Key for a run's stop flag, set by the scheduler when the run is cancelled. */
export function runStoppedKey(simulationId: string): string {
  return `sim:run:${simulationId}:stopped`;
}

/** The subset of Redis the delivery worker uses. Keeps tests free of a server. */
export interface RunCounters {
  incr(key: string): Promise<number>;
  exists(...keys: string[]): Promise<number>;
}
