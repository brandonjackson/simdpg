/**
 * The scheduler side of queued delivery: own the clock, own nothing else.
 *
 * Read events, enqueue each at its scheduled moment, aggregate the pool's Redis
 * counters onto a timer, and drain at the end. The scheduler never POSTs and
 * never learns which worker did what — it only sums counters.
 */

import { Queue, type JobsOptions } from "bullmq";
import { publishEvents, type ProgressSnapshot, type RunCounts } from "./scheduler.js";
import type { SimulationEvent } from "./events.js";
import {
  createRedis,
  markRunStopped,
  queueName,
  readRunCounters,
  resetRunCounters,
  type DeliveryJob,
} from "./queue.js";
import { sleep, log } from "../utils.js";

/** How often pool counters are summed and flushed to SQLite. */
export const FLUSH_INTERVAL_MS = 1000;
/** Queue depth past which lag is logged rather than left silent. */
export const BACKPRESSURE_THRESHOLD = 1000;
const DRAIN_POLL_MS = 100;

/**
 * Jobs are disposable: the outcome lives in a counter, so a completed job has
 * nothing left to say. Keeping the last failures aids debugging without letting
 * Redis grow with the run.
 */
const JOB_OPTIONS: JobsOptions = { removeOnComplete: true, removeOnFail: 1000 };

function drainTimeoutMs(): number {
  const raw = Number.parseInt(process.env.SIM_DRAIN_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
}

export interface QueuedRunParams {
  simulationId: string;
  events: SimulationEvent[];
  /** Wall-clock origin the schedule's micro offsets are relative to. */
  startMs: number;
  shouldStop: () => boolean;
  /**
   * Called on every flush and once at the end, with pool-aggregated counts.
   * `inFlight` is queue depth — the design's reinterpretation of that field, so
   * the portal's existing ProgressSnapshot shape is untouched.
   */
  onFlush: (snapshot: ProgressSnapshot) => void | Promise<void>;
}

export interface QueuedRunResult {
  counts: RunCounts;
  stopped: boolean;
  /** Worst scheduled-vs-actual enqueue gap; the ~1ms timer floor shows up here. */
  maxLagMs: number;
  peakQueueDepth: number;
  /** True when the pool never caught up within the drain timeout. */
  drainTimedOut: boolean;
}

export async function runQueuedDelivery(params: QueuedRunParams): Promise<QueuedRunResult> {
  const { simulationId, events, startMs, shouldStop, onFlush } = params;
  const total = events.length;
  const redis = createRedis();
  const queue = new Queue<DeliveryJob>(queueName(), { connection: redis });

  let peakQueueDepth = 0;
  let latest: RunCounts = { delivered: 0, skipped: 0, failed: 0, total };

  const snapshot = async (): Promise<RunCounts> => {
    const [counters, depths] = await Promise.all([
      readRunCounters(redis, simulationId),
      queue.getJobCounts("waiting", "active"),
    ]);
    const depth = (depths.waiting ?? 0) + (depths.active ?? 0);
    peakQueueDepth = Math.max(peakQueueDepth, depth);
    latest = { ...counters, total };
    await onFlush({ ...latest, inFlight: depth, peakConcurrency: peakQueueDepth });
    if (depth > BACKPRESSURE_THRESHOLD) {
      log(
        `Simulation ${simulationId}: queue depth ${depth} — the pool is behind the schedule`,
      );
    }
    return latest;
  };

  try {
    await resetRunCounters(redis, simulationId);

    // Flushing on a timer rather than per outcome is what keeps N workers off
    // SQLite: one writer, once a second, regardless of pool size.
    const flush = setInterval(() => { void snapshot(); }, FLUSH_INTERVAL_MS);

    let published;
    try {
      published = await publishEvents(events, startMs, {
        now: Date.now,
        sleep,
        shouldStop,
        publish: async (event) => {
          await queue.add("deliver", { simulationId, event }, JOB_OPTIONS);
        },
      });
    } finally {
      clearInterval(flush);
    }

    // Tell the pool to drop anything still queued for a stopped run, then drain
    // either way — a stopped run's leftovers resolve as skips within a poll or two.
    if (published.stopped) await markRunStopped(redis, simulationId);

    const deadline = Date.now() + drainTimeoutMs();
    let drainTimedOut = false;
    for (;;) {
      const counts = await snapshot();
      if (counts.delivered + counts.skipped + counts.failed >= published.enqueued) break;
      if (Date.now() >= deadline) {
        drainTimedOut = true;
        log(
          `Simulation ${simulationId}: drain timed out with ` +
            `${published.enqueued - (counts.delivered + counts.skipped + counts.failed)} ` +
            `deliveries unaccounted for — is the worker pool running?`,
        );
        break;
      }
      await sleep(DRAIN_POLL_MS);
    }

    return {
      counts: latest,
      stopped: published.stopped,
      maxLagMs: published.maxLagMs,
      peakQueueDepth,
      drainTimedOut,
    };
  } finally {
    await queue.close();
    redis.disconnect();
  }
}
