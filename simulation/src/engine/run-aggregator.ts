import type { CountsSource, OutcomeCounts } from "./run-counters.js";
import { writeRunState, type SimulationRunState } from "./run-state.js";
import type { ProgressSnapshot } from "./scheduler.js";
import { log as defaultLog, logError } from "../utils.js";

/** How often the scheduler flushes the pool's counters to SQLite. */
export const DEFAULT_FLUSH_INTERVAL_MS = 1000;
/** Queue depth at which the pool is declared behind and the lag is logged. */
export const DEFAULT_QUEUE_DEPTH_WARN = 500;
/** How long the terminal write waits for the queue to drain before giving up. */
export const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;

/** Flush interval override: SIM_STATE_FLUSH_MS. */
export function flushIntervalFromEnv(): number {
  const raw = Number.parseInt(process.env.SIM_STATE_FLUSH_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_FLUSH_INTERVAL_MS;
}

/** Lag threshold override: SIM_QUEUE_DEPTH_WARN. */
export function queueDepthWarnFromEnv(): number {
  const raw = Number.parseInt(process.env.SIM_QUEUE_DEPTH_WARN ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_QUEUE_DEPTH_WARN;
}

/** Fixed facts about the run, carried onto every row the aggregator writes. */
export interface RunIdentity {
  /** The scheduler's pid — the pid the portal SIGTERMs to stop the run. */
  pid: number;
  startedAt: string;
  /** Events in the run; the denominator the portal renders progress against. */
  total: number;
}

export interface AggregatorDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Settled counts across the whole pool. */
  readCounts: CountsSource;
  /** Jobs handed to the queue for this run so far, from the publish loop. */
  enqueued: () => number;
  /** Injected so tests need no database. Defaults to writeRunState, unchanged. */
  write?: (id: string, state: SimulationRunState) => Promise<void>;
  /** Called with every snapshot, so existing progress logging keeps working. */
  onProgress?: (snapshot: ProgressSnapshot) => void;
  log?: (message: string) => void;
}

export interface AggregatorOptions {
  flushIntervalMs?: number;
  queueDepthWarn?: number;
  drainTimeoutMs?: number;
}

/**
 * Aggregate a run's state across the worker pool and flush it to SQLite.
 *
 * The portal reads the same `simulation_runs` row it has always read, so this is
 * the only thing standing between a distributed run and live counts in the UI —
 * and it is why the pool needs no portal changes at all. Workers deliberately do
 * not write SQLite themselves: N processes contending on one writer would
 * reintroduce SQLITE_BUSY at exactly the rate the pool exists to reach.
 *
 * `ProgressSnapshot.inFlight` is reinterpreted as **queue depth** — the jobs
 * enqueued for this run that no worker has settled yet. In-process that was
 * "POSTs in flight"; with a pool the useful number is how far behind the pool
 * is. The shape is unchanged so existing progress logging still works, and
 * `peakConcurrency` becomes the high-water queue depth.
 */
export class RunStateAggregator {
  private readonly flushIntervalMs: number;
  private readonly queueDepthWarn: number;
  private readonly drainTimeoutMs: number;
  private readonly write: (id: string, state: SimulationRunState) => Promise<void>;
  private readonly log: (message: string) => void;

  private peakDepth = 0;
  private lagging = false;
  private stopped = false;
  /** In-flight flush, so a slow write is never overlapped by the next tick. */
  private flushing: Promise<unknown> | null = null;
  private loop: Promise<void> | null = null;
  /** Resolves on stop(), so the timer loop wakes without waiting out its sleep. */
  private readonly stopSignal: Promise<void>;
  private wake!: () => void;

  constructor(
    private readonly id: string,
    private readonly run: RunIdentity,
    private readonly deps: AggregatorDeps,
    options: AggregatorOptions = {},
  ) {
    this.flushIntervalMs = Math.max(1, options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS);
    this.queueDepthWarn = Math.max(1, options.queueDepthWarn ?? DEFAULT_QUEUE_DEPTH_WARN);
    this.drainTimeoutMs = Math.max(0, options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS);
    this.write = deps.write ?? writeRunState;
    this.log = deps.log ?? defaultLog;
    this.stopSignal = new Promise<void>((resolve) => {
      this.wake = resolve;
    });
  }

  /** Read the counters and derive a snapshot. Never writes. */
  async snapshot(): Promise<ProgressSnapshot> {
    const counts = await this.deps.readCounts();
    // Depth is what the publish loop has handed over minus what the pool has
    // settled. Clamp at zero: the two reads are not atomic, so a worker can
    // settle a job between them.
    const settled = counts.delivered + counts.skipped + counts.failed;
    const inFlight = Math.max(0, this.deps.enqueued() - settled);
    this.peakDepth = Math.max(this.peakDepth, inFlight);
    this.noteLag(inFlight);

    const snapshot: ProgressSnapshot = {
      ...counts,
      total: this.run.total,
      inFlight,
      peakConcurrency: this.peakDepth,
    };
    this.deps.onProgress?.(snapshot);
    return snapshot;
  }

  /** Flush the current counters to the run's row. */
  async flush(status: SimulationRunState["status"] = "running"): Promise<ProgressSnapshot> {
    // Serialize against any flush already running: two overlapping writes could
    // land out of order and leave the row showing counts that have gone
    // backwards — or, worse, a `running` row after the terminal write.
    const prior = this.flushing;
    if (prior) await prior.catch(() => {});
    const pending = this.flushOnce(status);
    this.flushing = pending;
    try {
      return await pending;
    } finally {
      if (this.flushing === pending) this.flushing = null;
    }
  }

  private async flushOnce(status: SimulationRunState["status"]): Promise<ProgressSnapshot> {
    const snapshot = await this.snapshot();
    await this.write(this.id, this.stateFor(status, snapshot));
    return snapshot;
  }

  /** Start flushing on the timer. Returns immediately; call stop() to end it. */
  start(): void {
    if (this.loop) return;
    this.loop = this.runLoop();
  }

  /** Stop the timer and wait for any flush already under way. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.wake();
    const loop = this.loop;
    this.loop = null;
    if (loop) await loop;
    if (this.flushing) await this.flushing.catch(() => {});
  }

  private async runLoop(): Promise<void> {
    while (!this.stopped) {
      // Racing the stop signal means stop() returns promptly instead of waiting
      // out a whole interval before the terminal write can go in.
      await Promise.race([this.deps.sleep(this.flushIntervalMs), this.stopSignal]);
      if (this.stopped) return;
      try {
        await this.flush("running");
      } catch (err) {
        // A failed flush costs one second of staleness in the portal; it must
        // never end the run, so log it and keep flushing.
        logError(`Simulation ${this.id}: run-state flush failed`, err);
      }
    }
  }

  /**
   * Stop flushing, wait for the queue to drain, and write the terminal state
   * once — the counts are only final when no job is outstanding.
   *
   * Pass `drain: false` when there is nothing left to wait for (a crash, or a
   * run that never published), so the terminal state is written immediately.
   */
  async finish(
    status: Exclude<SimulationRunState["status"], "running">,
    opts: { error?: string; drain?: boolean } = {},
  ): Promise<ProgressSnapshot> {
    await this.stop();
    if (opts.drain !== false) await this.waitForDrain();
    const snapshot = await this.snapshot();
    await this.write(this.id, this.stateFor(status, snapshot, opts.error));
    return snapshot;
  }

  /**
   * Poll until the queue is empty, flushing as we go so the portal keeps showing
   * live counts through the drain. Bounded: a worker that died holding a job
   * would otherwise leave the run `running` for ever, so on timeout we write the
   * terminal state with the counts we have and say so.
   */
  private async waitForDrain(): Promise<boolean> {
    const deadline = this.deps.now() + this.drainTimeoutMs;
    const pollMs = Math.min(this.flushIntervalMs, 250);
    for (;;) {
      let depth: number;
      try {
        depth = (await this.flush("running")).inFlight;
      } catch (err) {
        logError(`Simulation ${this.id}: run-state flush failed while draining`, err);
        depth = Number.POSITIVE_INFINITY;
      }
      if (depth <= 0) return true;
      if (this.deps.now() >= deadline) {
        this.log(
          `Simulation ${this.id}: queue still holding ${depth} job(s) after ` +
            `${this.drainTimeoutMs}ms — writing terminal state with the counts observed so far`,
        );
        return false;
      }
      await this.deps.sleep(pollMs);
    }
  }

  private stateFor(
    status: SimulationRunState["status"],
    counts: OutcomeCounts,
    error?: string,
  ): SimulationRunState {
    const terminal = status !== "running";
    return {
      pid: this.run.pid,
      status,
      startedAt: this.run.startedAt,
      completedAt: terminal ? new Date().toISOString() : undefined,
      error,
      delivered: counts.delivered,
      skipped: counts.skipped,
      failed: counts.failed,
      total: this.run.total,
    };
  }

  /**
   * Surface a pool that cannot keep up. The scheduler must *not* pause to let
   * the workers catch up — pausing shifts every later event and corrupts the
   * schedule — so lag is made visible instead, once on the way up and once on
   * the way back down. Recovery is only declared at half the threshold, so depth
   * hovering around it does not produce a log line per flush.
   */
  private noteLag(depth: number): void {
    if (!this.lagging && depth >= this.queueDepthWarn) {
      this.lagging = true;
      this.log(
        `Simulation ${this.id}: queue depth ${depth} (>= ${this.queueDepthWarn}) — the worker ` +
          `pool is behind and deliveries are running late; not pausing the schedule`,
      );
      return;
    }
    if (this.lagging && depth < this.queueDepthWarn / 2) {
      this.lagging = false;
      this.log(`Simulation ${this.id}: queue depth back to ${depth} — the pool has caught up`);
    }
  }
}
