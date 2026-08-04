import type { EventOutcome } from "./scheduler.js";

/**
 * Where the counts that make up a run's progress come from.
 *
 * With a pool of N delivery workers no single process knows the counts any more:
 * each worker INCRs a Redis counter per outcome and nobody holds the total. The
 * scheduler therefore *aggregates* — it reads the counters back through this
 * port and flushes them to SQLite (see run-aggregator.ts). Keeping it a port
 * means the aggregator is identical whether the counts come from Redis or from
 * in-process delivery, and it needs no Redis client to be tested.
 */
export interface OutcomeCounts {
  delivered: number;
  skipped: number;
  failed: number;
}

/** Reads the current settled counts for one run. */
export type CountsSource = () => OutcomeCounts | Promise<OutcomeCounts>;

/** The three outcomes `deliver()` can produce, in counter-key order. */
export const OUTCOMES: readonly EventOutcome[] = ["delivered", "skipped", "failed"];

/** Redis key namespace for per-run state, per the queued-delivery design. */
const RUN_PREFIX = "sim:run";

/** `sim:run:<id>:<outcome>` — one INCR target per outcome. */
export function counterKey(id: string, outcome: EventOutcome): string {
  return `${RUN_PREFIX}:${id}:${outcome}`;
}

/** `sim:run:<id>:stopped` — set by the scheduler, read per job by the workers. */
export function stopFlagKey(id: string): string {
  return `${RUN_PREFIX}:${id}:stopped`;
}

/** Every key a run owns, so the scheduler can clean up after a terminal write. */
export function runKeys(id: string): string[] {
  return [...OUTCOMES.map((o) => counterKey(id, o)), stopFlagKey(id)];
}

/**
 * The slice of a Redis client the aggregator needs. Declared structurally so
 * this module carries no client dependency: any `ioredis`-shaped client (or a
 * fake, in tests) satisfies it.
 */
export interface RedisCounterClient {
  mget(...keys: string[]): Promise<(string | null | undefined)[]>;
}

/** A missing counter means "no worker has recorded that outcome yet", i.e. 0. */
function toCount(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Read a run's counters out of Redis in a single round trip.
 *
 * MGET (rather than three GETs) keeps the aggregation flush at one Redis op per
 * second per run, so aggregation costs nothing against the ops budget the queue
 * itself is spending.
 */
export function redisCountsSource(client: RedisCounterClient, id: string): CountsSource {
  const keys = OUTCOMES.map((o) => counterKey(id, o));
  return async () => {
    const [delivered, skipped, failed] = await client.mget(...keys);
    return { delivered: toCount(delivered), skipped: toCount(skipped), failed: toCount(failed) };
  };
}
