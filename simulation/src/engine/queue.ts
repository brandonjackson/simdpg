import { Queue } from "bullmq";
import type Redis from "ioredis";
import type { SimulationEvent } from "./events.js";
import type { EventOutcome } from "./delivery.js";

/**
 * Shared vocabulary for the delivery queue: the queue name, the job shape, and
 * the Redis counter keys. The producer (scheduler) and the run-state aggregator
 * import these too, so they live in one place rather than being restated.
 */

/**
 * The single work queue every run's deliveries flow through. The design doc
 * calls this `sim:deliveries`, but BullMQ forbids `:` in a queue name (it's the
 * internal key separator), so the hyphen form is used. The Redis counter keys
 * below are plain keys, not queue names, so they keep the `:` convention.
 */
export const DELIVERY_QUEUE = "sim-deliveries";

/**
 * The BullMQ job name every delivery is added under. Workers don't filter on it
 * (one handler serves the queue), so it's a label for introspection rather than
 * routing — but a stable constant keeps producer and any future consumer aligned.
 */
export const DELIVERY_JOB = "deliver";

/**
 * One delivery job. Carries the full event payload plus the run it belongs to —
 * never an event id or a file path — so a worker needs only REDIS_URL and no
 * SIM_DATA_DIR volume mount. See the design doc's "Message contents".
 */
export interface DeliveryJob {
  simulationId: string;
  event: SimulationEvent;
}

/** The three outcome tallies a run accumulates, read back from Redis counters. */
export interface OutcomeCounts {
  delivered: number;
  skipped: number;
  failed: number;
}

/**
 * Per-run outcome counters, keyed by the same words `deliver()` returns. Workers
 * INCR these; the scheduler reads them to know when a run has drained and what
 * its terminal counts are.
 */
export function counterKey(simulationId: string, outcome: EventOutcome): string {
  return `sim:run:${simulationId}:${outcome}`;
}

function toCount(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read a run's outcome counters in one round trip. A missing key (nothing of
 * that outcome yet) reads as 0. The scheduler polls this to detect drain and to
 * take the run's final counts, since the workers — not the scheduler — own the
 * tallies.
 */
export async function readCounters(
  redis: Pick<Redis, "mget">,
  simulationId: string,
): Promise<OutcomeCounts> {
  const [delivered, skipped, failed] = await redis.mget(
    counterKey(simulationId, "delivered"),
    counterKey(simulationId, "skipped"),
    counterKey(simulationId, "failed"),
  );
  return { delivered: toCount(delivered), skipped: toCount(skipped), failed: toCount(failed) };
}

/**
 * Clear a run's counters before it starts. Run ids are unique per run, so this
 * matters only when one is deliberately re-run — without it, stale tallies would
 * make the new run look already-drained. Cheap and idempotent either way.
 */
export async function resetCounters(
  redis: Pick<Redis, "del">,
  simulationId: string,
): Promise<void> {
  await redis.del(
    counterKey(simulationId, "delivered"),
    counterKey(simulationId, "skipped"),
    counterKey(simulationId, "failed"),
  );
}

/**
 * A `Queue` handle for enqueuing deliveries. Used by the producer (#90); defined
 * here so queue name and connection config stay with the rest of the queue
 * vocabulary. Caller owns the connection and the returned queue.
 */
export function createDeliveryQueue(connection: Redis): Queue<DeliveryJob> {
  return new Queue<DeliveryJob>(DELIVERY_QUEUE, {
    connection,
    defaultJobOptions: {
      // A run is fire-and-forget fan-out: nothing reads finished job records, so
      // keeping them would grow Redis by one hash per event (~100k/run) for no
      // benefit. Drop them as they settle.
      removeOnComplete: true,
      // Since deliver() never throws, a *failed* BullMQ job is only ever a
      // genuine infra fault (Redis dropped, unparseable job) — rare, and exactly
      // what you'd want to inspect. Keep a rolling window of the most recent
      // 1000 (queue-wide) rather than discarding them; capped so it can't grow
      // unbounded. Richer per-job visibility is #81's job.
      removeOnFail: { count: 1000 },
      // deliver() never throws — a failed POST is a counted outcome, not a job
      // error — so a retry would only re-POST an event the run already recorded.
      // A crashed worker is covered separately by BullMQ's stalled-job redelivery.
      attempts: 1,
    },
  });
}
