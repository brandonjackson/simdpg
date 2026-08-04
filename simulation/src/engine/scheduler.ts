import type { SimulationEvent } from "./events.js";
import type { OutcomeCounts } from "./queue.js";
import { log } from "../utils.js";

/** How often, in ms, the run's counters are re-read. See the publish/drain
 * split in runEvents. */
export const DEFAULT_DRAIN_POLL_MS = 250;

/**
 * How long the drain phase tolerates the settled total not moving at all before
 * it gives up waiting.
 *
 * A stall budget rather than a wall-clock deadline: a legitimately large backlog
 * can take arbitrarily long to work through, and a deadline would abandon it
 * while it was still making progress. What is *not* recoverable is a job that
 * will never settle — a worker OOM past BullMQ's stalled-job redelivery, an
 * unparseable job, a counter key evicted — and that shows up as zero movement.
 * Without this the scheduler polls forever, the process never exits, and the
 * run row is stuck `running`.
 *
 * 60s is 4x `deliver()`'s own 15s POST timeout, so even a pool where every
 * request is timing out still advances the counters well inside the budget.
 */
export const DEFAULT_DRAIN_STALL_MS = 60_000;

export interface RunCounts extends OutcomeCounts {
  total: number;
}

/** Live view of a run, emitted as events publish and as the pool settles them. */
export interface ProgressSnapshot extends RunCounts {
  /** Events published to the queue so far (the drain target). */
  enqueued: number;
  /** Published but not yet settled by the pool — this run's share of the queue.
   * Queue depth per *run*, which BullMQ's queue-wide counts cannot give us. */
  depth: number;
  /** How far behind its scheduled moment the most recent publish was, in ms. */
  lagMs: number;
}

export interface RunDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  shouldStop: () => boolean;
  /** Put one event on the delivery queue. The scheduler no longer POSTs — the
   * worker pool does — so this replaces the old `deliver()` call. */
  enqueue: (event: SimulationEvent) => Promise<void>;
  /** Read this run's outcome counters (workers own them). Polled to detect drain
   * and to take the terminal counts. */
  readCounts: () => Promise<OutcomeCounts>;
  /** Called as events publish and on each drain poll, so callers can log live
   * progress and surface a pool that is falling behind. */
  onProgress?: (snapshot: ProgressSnapshot) => void;
}

export interface RunOptions {
  /** ms between counter reads. Defaults to DEFAULT_DRAIN_POLL_MS. */
  drainPollMs?: number;
  /** ms of zero drain progress before giving up. Defaults to
   * DEFAULT_DRAIN_STALL_MS. */
  drainStallMs?: number;
}

export interface RunResult {
  counts: RunCounts;
  stopped: boolean;
  /** Events actually published — fewer than total if the run was stopped early
   * or an enqueue was rejected. */
  enqueued: number;
  /** Events the queue rejected. Publishing continued; these are never delivered. */
  failedToEnqueue: number;
  /** Worst gap between an event's scheduled moment and its publish, in ms. The
   * one number that says whether the schedule actually held. */
  maxLagMs: number;
  /** True if the drain phase gave up with jobs still unsettled. The counts are
   * then a floor, not a total. */
  drainStalled: boolean;
}

const settled = (c: OutcomeCounts): number => c.delivered + c.skipped + c.failed;

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Publish every event to the delivery queue at its real-time offset, then wait
 * for the worker pool to settle them.
 *
 * The scheduler owns the clock and nothing else: it walks the sorted events and
 * enqueues each at its scheduled moment (workers hold no timing). Enqueue is a
 * cheap round trip, so — unlike the old in-process delivery — a slow endpoint
 * can't stall the schedule and there's no concurrency cap to manage here; pool
 * size (replicas × per-worker concurrency) is the throughput knob now.
 *
 * The loop never pauses to let the pool catch up, because pausing corrupts the
 * schedule. A pool losing the race shows up as `lagMs`/`depth` in the progress
 * snapshots instead, so lag is visible rather than silent.
 *
 * Completion is counter-based, not queue-depth-based: the queue is shared by all
 * runs, so "is the queue empty" can't answer "is *this* run done". Instead the
 * drain phase polls this run's Redis counters until the settled total reaches
 * what we enqueued, and returns those counters as the terminal counts. Never
 * throws — a rejected enqueue is counted, not raised, and delivery outcomes are
 * the workers'.
 */
export async function runEvents(
  events: SimulationEvent[],
  startMs: number,
  deps: RunDeps,
  options: RunOptions = {},
): Promise<RunResult> {
  const ordered = [...events].sort((a, b) => a.scheduledMicros - b.scheduledMicros);
  const total = events.length;
  const drainPollMs = options.drainPollMs ?? DEFAULT_DRAIN_POLL_MS;
  const drainStallMs = options.drainStallMs ?? DEFAULT_DRAIN_STALL_MS;

  let counts: OutcomeCounts = { delivered: 0, skipped: 0, failed: 0 };
  let enqueued = 0;
  let failedToEnqueue = 0;
  let lagMs = 0;
  let maxLagMs = 0;
  let lastReadAt = Number.NEGATIVE_INFINITY;

  const emitProgress = (): void => {
    // Clamped: a counter read can lag or, after a re-run, overshoot, and a
    // negative depth in a log line is noise rather than information.
    const depth = Math.max(0, enqueued - settled(counts));
    deps.onProgress?.({ ...counts, total, enqueued, depth, lagMs });
  };

  // The publish loop wants live-ish counts so depth and progress mean something,
  // but not a counter round trip per event on top of the enqueue. Rate-limit to
  // the poll interval; the drain phase forces a read every time.
  const refreshCounts = async (force: boolean): Promise<void> => {
    if (!force && deps.now() - lastReadAt < drainPollMs) return;
    lastReadAt = deps.now();
    counts = await deps.readCounts();
  };

  // Publish phase: enqueue each event at its scheduled wall-clock moment. Every
  // event is published, including null-targetUrl ones — the worker classifies
  // those as "skipped"; the scheduler no longer makes that call itself.
  let stopped = false;
  for (const event of ordered) {
    if (deps.shouldStop()) { stopped = true; break; }
    const targetMs = startMs + event.scheduledMicros / 1000;
    const waitMs = targetMs - deps.now();
    if (waitMs > 0) await deps.sleep(waitMs);
    if (deps.shouldStop()) { stopped = true; break; }

    try {
      await deps.enqueue(event);
      enqueued += 1;
    } catch (err) {
      // A rejected publish loses one event. It must not abort the run: throwing
      // here would discard every outcome the pool has already recorded and
      // report the whole run as failed with zeroed counts.
      failedToEnqueue += 1;
      log(`enqueue failed ${event.id} (${event.targetKey}): ${message(err)}`);
    }
    // Measured after the enqueue resolves, so it includes the round trip the
    // publish itself costs — that is the drift that accumulates into the schedule.
    lagMs = Math.max(0, deps.now() - targetMs);
    maxLagMs = Math.max(maxLagMs, lagMs);
    await refreshCounts(false);
    emitProgress();
  }

  // Drain phase: wait until the pool has settled every job we enqueued. A
  // stopped run skips the wait — its already-queued jobs keep draining on the
  // workers, but the scheduler is on its way out and reports the snapshot it has.
  await refreshCounts(true);
  emitProgress();

  let lastSettled = settled(counts);
  let lastAdvanceAt = deps.now();
  let drainStalled = false;
  while (settled(counts) < enqueued && !deps.shouldStop()) {
    if (deps.now() - lastAdvanceAt >= drainStallMs) {
      drainStalled = true;
      log(
        `drain gave up: ${settled(counts)}/${enqueued} settled, no movement for ` +
          `${drainStallMs}ms — ${enqueued - settled(counts)} job(s) will never settle`,
      );
      break;
    }
    await deps.sleep(drainPollMs);
    await refreshCounts(true);
    if (settled(counts) > lastSettled) {
      lastSettled = settled(counts);
      lastAdvanceAt = deps.now();
    }
    emitProgress();
  }

  return { counts: { ...counts, total }, stopped, enqueued, failedToEnqueue, maxLagMs, drainStalled };
}
