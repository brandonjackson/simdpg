import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { SimulationEvent } from "./events.js";
import { createRedis } from "./redis.js";

/**
 * The single BullMQ queue every run's deliveries flow through. One pool of
 * workers serves all runs, so jobs carry their own `simulationId` rather than
 * the queue being partitioned per run.
 */
export const DELIVERY_QUEUE_NAME = "sim:deliveries";

/**
 * A unit of work for a delivery worker.
 *
 * The job carries the **full event**, not an event id: workers must be able to
 * POST it without reading `events.json`, which is what keeps them stateless and
 * free of a `SIM_DATA_DIR` mount. At ~500B per event and 100k events that is
 * ~50MB through Redis per run, which the design accepts.
 */
export interface DeliveryJob {
  simulationId: string;
  event: SimulationEvent;
}

/**
 * Open the delivery queue for publishing. Callers own the returned queue and
 * must `close()` it; pass a connection to share one with other components.
 */
export function createDeliveryQueue(connection: Redis = createRedis()): Queue<DeliveryJob> {
  return new Queue<DeliveryJob>(DELIVERY_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      // A run is a fire-and-forget fan-out: keeping completed/failed job records
      // around would grow Redis by one hash per event with nothing reading them.
      removeOnComplete: true,
      removeOnFail: true,
      // `deliver()` never throws — a failed HTTP response is a counted outcome,
      // not a job failure — so retrying would only ever re-POST an event that
      // the run has already recorded. Crashed workers are covered separately by
      // BullMQ's stalled-job redelivery.
      attempts: 1,
    },
  });
}
