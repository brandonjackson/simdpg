import {
  deliver,
  type DeliveryDeps,
  type DeliveryJob,
  type DeliveryQueue,
  type EventOutcome,
} from "./scheduler.js";

/** Default POSTs this process runs at once. See #59: serial delivery to slow
 * remote webhooks made runs take ~Σ(latency) instead of the scheduled span. */
export const DEFAULT_MAX_CONCURRENCY = 20;

export interface InProcessQueueOptions {
  /** POSTs in flight at once. Defaults to DEFAULT_MAX_CONCURRENCY. */
  concurrency?: number;
  /** Checked per job: a stopped run abandons whatever is still queued. */
  shouldStop?: () => boolean;
  onOutcome?: (outcome: EventOutcome) => void;
}

export interface InProcessQueue extends DeliveryQueue {
  waitForDrain(): Promise<void>;
  /** Outcomes so far. `total` belongs to the caller, which knows the run size. */
  counts(): { delivered: number; skipped: number; failed: number };
  /** Jobs accepted but not yet delivered — this queue's depth. */
  depth(): number;
}

/**
 * A DeliveryQueue that consumes its own jobs in this process.
 *
 * The scheduler publishes rather than delivers now, but until the Redis-backed
 * worker pool exists something still has to POST. This is that stand-in, and it
 * is where the per-consumer concurrency cap lives — the cap belongs to whatever
 * drains the queue, not to the loop that fills it. Swapping in the real queue is
 * then a one-line change at the entry point.
 */
export function createInProcessQueue(
  deps: DeliveryDeps,
  options: InProcessQueueOptions = {},
): InProcessQueue {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_MAX_CONCURRENCY);
  const waiting: DeliveryJob[] = [];
  const counts = { delivered: 0, skipped: 0, failed: 0 };
  let running = 0;
  let drainWaiters: (() => void)[] = [];

  const drained = (): boolean => running === 0 && waiting.length === 0;

  const runJob = async (job: DeliveryJob): Promise<void> => {
    // Mirrors the pool's per-job stop check: work queued before the stop is
    // dropped rather than delivered late.
    if (options.shouldStop?.()) return;
    const outcome = await deliver(job.event, deps);
    counts[outcome] += 1;
    options.onOutcome?.(outcome);
  };

  const pump = (): void => {
    while (running < concurrency && waiting.length > 0) {
      const job = waiting.shift() as DeliveryJob;
      running += 1;
      void runJob(job)
        .catch(() => {})
        .finally(() => {
          running -= 1;
          pump();
        });
    }
    if (!drained()) return;
    for (const resolve of drainWaiters) resolve();
    drainWaiters = [];
  };

  return {
    async enqueue(job: DeliveryJob): Promise<void> {
      waiting.push(job);
      pump();
    },
    waitForDrain(): Promise<void> {
      if (drained()) return Promise.resolve();
      return new Promise<void>((resolve) => { drainWaiters.push(resolve); });
    },
    counts: () => ({ ...counts }),
    depth: () => running + waiting.length,
  };
}
