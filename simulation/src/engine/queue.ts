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
 * One delivery job. Carries the full event payload plus the run it belongs to —
 * never an event id or a file path — so a worker needs only REDIS_URL and no
 * SIM_DATA_DIR volume mount. See the design doc's "Message contents".
 */
export interface DeliveryJob {
  simulationId: string;
  event: SimulationEvent;
}

/**
 * Per-run outcome counters, keyed by the same words `deliver()` returns. Workers
 * INCR these; the aggregator (#91) reads them to build run state.
 */
export function counterKey(simulationId: string, outcome: EventOutcome): string {
  return `sim:run:${simulationId}:${outcome}`;
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
