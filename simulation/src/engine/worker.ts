import { beginBehavior } from "./behavior.js";
import { readEvents, type SimulationEvent } from "./events.js";
import {
  RunStateAggregator,
  flushIntervalFromEnv,
  queueDepthWarnFromEnv,
} from "./run-aggregator.js";
import { writeRunState } from "./run-state.js";
import { runEvents, DEFAULT_MAX_CONCURRENCY, type ProgressSnapshot } from "./scheduler.js";
import { sleep, log, logError } from "../utils.js";

/** Concurrent deliveries allowed; override with SIM_MAX_CONCURRENCY. */
function maxConcurrencyFromEnv(): number {
  const raw = Number.parseInt(process.env.SIM_MAX_CONCURRENCY ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_CONCURRENCY;
}

/** Min ms between live progress log lines, so a big run isn't per-event noise. */
const PROGRESS_LOG_INTERVAL_MS = 1000;

/**
 * Execute a generated simulation: schedule every event's POST by real time,
 * flushing run-state to the shared database as the counts move (see
 * RunStateAggregator) and once more when it ends. writeRunState also
 * stamps the authoritative `simulations` record, so the portal reads a
 * consistent status with no reconciliation. Never throws — failures are written
 * as run-state.
 */
export async function runWorker(id: string): Promise<void> {
  // The portal tees our stdio to its terminal; if it restarts mid-run the pipe
  // breaks. Swallow EPIPE so a hot-reload can't kill an in-flight simulation
  // (its log file, opened by the portal, keeps recording regardless).
  process.stdout.on("error", () => {});
  process.stderr.on("error", () => {});

  const startedAt = new Date().toISOString();
  let events: SimulationEvent[];
  try {
    events = await readEvents(id);
  } catch (err) {
    await writeRunState(id, {
      pid: process.pid, status: "failed", startedAt, completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      delivered: 0, skipped: 0, failed: 0, total: 0,
    });
    logError(`Simulation ${id} failed to start`, err);
    return;
  }

  let stopped = false;
  process.on("SIGTERM", () => { stopped = true; });

  // Nothing here writes run-state directly any more: the aggregator owns the row
  // and flushes it on a timer, which is what gives the portal live counts. With
  // a worker pool no single process knows the counts, so the counts have to be
  // read back from somewhere — today that is this process's own progress
  // snapshots, and once delivery moves to the pool only `readCounts` changes
  // (to `redisCountsSource`). Nothing downstream, in the portal included, moves.
  let latest: ProgressSnapshot = {
    delivered: 0, skipped: 0, failed: 0, total: events.length, inFlight: 0, peakConcurrency: 0,
  };
  const aggregator = new RunStateAggregator(
    id,
    { pid: process.pid, startedAt, total: events.length },
    {
      now: Date.now,
      sleep,
      readCounts: () => ({
        delivered: latest.delivered, skipped: latest.skipped, failed: latest.failed,
      }),
      // Handed to delivery but not yet settled — queue depth once a pool owns
      // delivery, POSTs in flight while it is this process.
      enqueued: () =>
        latest.delivered + latest.skipped + latest.failed + latest.inFlight,
    },
    { flushIntervalMs: flushIntervalFromEnv(), queueDepthWarn: queueDepthWarnFromEnv() },
  );

  await aggregator.flush("running");
  log(`Simulation ${id}: running ${events.length} events (cap ${maxConcurrencyFromEnv()})`);

  // Degrade the systems for the length of this run, if the simulation asked for
  // it, and get back the undo. Applied before the first delivery so the very
  // first workflow call already sees the configured latency and failures.
  const lastEventMs =
    events.reduce((max, event) => Math.max(max, event.scheduledMicros), 0) / 1000;
  const endBehavior = await beginBehavior(id, lastEventMs);

  const maxConcurrency = maxConcurrencyFromEnv();
  const runStart = Date.now();
  let lastProgressLog = 0;
  const onProgress = (s: ProgressSnapshot): void => {
    latest = s;
    const now = Date.now();
    const done = s.delivered + s.skipped + s.failed;
    // Log at most once per interval, but always log the final drain (inFlight 0).
    if (now - lastProgressLog < PROGRESS_LOG_INTERVAL_MS && s.inFlight > 0) return;
    lastProgressLog = now;
    const secs = ((now - runStart) / 1000).toFixed(1);
    log(
      `Simulation ${id} [+${secs}s]: in-flight ${s.inFlight}/${maxConcurrency} ` +
        `(peak ${s.peakConcurrency}) — delivered ${s.delivered}, skipped ${s.skipped}, ` +
        `failed ${s.failed} of ${s.total} (${done}/${s.total} done)`,
    );
  };

  aggregator.start();
  try {
    const { stopped: wasStopped, peakConcurrency } = await runEvents(
      events,
      runStart,
      { now: Date.now, sleep, fetch, shouldStop: () => stopped, onProgress },
      { maxConcurrency },
    );
    // finish() waits for the queue to drain before the terminal write, so the
    // counts it records are final rather than a snapshot mid-flight.
    await aggregator.finish(wasStopped ? "stopped" : "completed");
    log(
      `Simulation ${id}: ${wasStopped ? "stopped" : "completed"} ` +
        `(peak concurrency ${peakConcurrency}/${maxConcurrency})`,
    );
  } catch (err) {
    // Nothing is outstanding after a crash, so don't wait on a drain that will
    // never come — record whatever was delivered before it went down.
    await aggregator.finish("failed", {
      error: err instanceof Error ? err.message : String(err),
      drain: false,
    });
    logError(`Simulation ${id} crashed`, err);
  } finally {
    // However the run ended — completed, stopped, or crashed — the systems go
    // back to behaving normally.
    await endBehavior();
  }
}
