import { readEvents, type SimulationEvent } from "./events.js";
import { writeRunState, type SimulationRunState } from "./run-state.js";
import {
  runEvents,
  DEFAULT_MAX_CONCURRENCY,
  type RunCounts,
  type ProgressSnapshot,
} from "./scheduler.js";
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
 * then record the terminal run-state to the shared database. writeRunState also
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

  await writeRunState(id, {
    pid: process.pid, status: "running", startedAt,
    delivered: 0, skipped: 0, failed: 0, total: events.length,
  });
  log(`Simulation ${id}: running ${events.length} events (cap ${maxConcurrencyFromEnv()})`);

  const finalize = async (status: SimulationRunState["status"], counts: RunCounts) => {
    await writeRunState(id, {
      pid: process.pid, status, startedAt, completedAt: new Date().toISOString(),
      delivered: counts.delivered, skipped: counts.skipped, failed: counts.failed, total: counts.total,
    });
  };

  const maxConcurrency = maxConcurrencyFromEnv();
  const runStart = Date.now();
  let lastProgressLog = 0;
  const onProgress = (s: ProgressSnapshot): void => {
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

  try {
    const { counts, stopped: wasStopped, peakConcurrency } = await runEvents(
      events,
      runStart,
      { now: Date.now, sleep, fetch, shouldStop: () => stopped, onProgress },
      { maxConcurrency },
    );
    await finalize(wasStopped ? "stopped" : "completed", counts);
    log(
      `Simulation ${id}: ${wasStopped ? "stopped" : "completed"} ` +
        `(peak concurrency ${peakConcurrency}/${maxConcurrency})`,
    );
  } catch (err) {
    await writeRunState(id, {
      pid: process.pid, status: "failed", startedAt, completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      delivered: 0, skipped: 0, failed: 0, total: events.length,
    });
    logError(`Simulation ${id} crashed`, err);
  }
}
