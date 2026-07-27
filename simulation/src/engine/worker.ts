import { readEvents, type SimulationEvent } from "./events.js";
import { writeRunState, type SimulationRunState } from "./run-state.js";
import { runEvents, type RunCounts, type PublishSnapshot } from "./scheduler.js";
import { createInProcessQueue, DEFAULT_MAX_CONCURRENCY } from "./in-process-queue.js";
import { sleep, log, logError } from "../utils.js";

/** Concurrent deliveries allowed; override with SIM_MAX_CONCURRENCY. */
function maxConcurrencyFromEnv(): number {
  const raw = Number.parseInt(process.env.SIM_MAX_CONCURRENCY ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_CONCURRENCY;
}

/** Min ms between live progress log lines, so a big run isn't per-event noise. */
const PROGRESS_LOG_INTERVAL_MS = 1000;

/** Queue depth past which consumers are visibly losing the race with the clock. */
const QUEUE_DEPTH_WARN = 500;

/**
 * Execute a generated simulation: publish every event to the delivery queue at
 * its scheduled real time, then record the terminal run-state to the shared
 * database. writeRunState also stamps the authoritative `simulations` record, so
 * the portal reads a consistent status with no reconciliation. Never throws —
 * failures are written as run-state.
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

  const concurrency = maxConcurrencyFromEnv();
  log(`Simulation ${id}: running ${events.length} events (delivery concurrency ${concurrency})`);

  const finalize = async (status: SimulationRunState["status"], counts: RunCounts) => {
    await writeRunState(id, {
      pid: process.pid, status, startedAt, completedAt: new Date().toISOString(),
      delivered: counts.delivered, skipped: counts.skipped, failed: counts.failed, total: counts.total,
    });
  };

  // Until the Redis-backed pool lands, this process is also the consumer.
  const queue = createInProcessQueue({ fetch }, { concurrency, shouldStop: () => stopped });

  const runStart = Date.now();
  let lastProgressLog = 0;
  let lastDepthWarn = 0;

  const warnIfBehind = (depth: number, now: number): void => {
    if (depth < QUEUE_DEPTH_WARN || now - lastDepthWarn < PROGRESS_LOG_INTERVAL_MS) return;
    lastDepthWarn = now;
    log(`Simulation ${id}: queue depth ${depth} — delivery is falling behind the schedule`);
  };

  const onProgress = (s: PublishSnapshot): void => {
    const now = Date.now();
    const depth = queue.depth();
    warnIfBehind(depth, now);
    // Log at most once per interval, but always log the final publish.
    if (now - lastProgressLog < PROGRESS_LOG_INTERVAL_MS && s.pending > 0) return;
    lastProgressLog = now;
    const c = queue.counts();
    const done = c.delivered + c.skipped + c.failed;
    const secs = ((now - runStart) / 1000).toFixed(1);
    log(
      `Simulation ${id} [+${secs}s]: queued ${s.enqueued}/${s.total} ` +
        `(depth ${depth}, lag ${Math.round(s.lagMs)}ms) — delivered ${c.delivered}, ` +
        `skipped ${c.skipped}, failed ${c.failed} (${done}/${s.total} done)`,
    );
  };

  try {
    const result = await runEvents(events, runStart, {
      now: Date.now,
      sleep,
      shouldStop: () => stopped,
      simulationId: id,
      queue,
      onProgress,
    });
    const counts: RunCounts = { ...queue.counts(), total: events.length };
    await finalize(result.stopped ? "stopped" : "completed", counts);
    log(
      `Simulation ${id}: ${result.stopped ? "stopped" : "completed"} — ` +
        `queued ${result.enqueued}/${result.total}` +
        (result.failedToEnqueue > 0 ? `, ${result.failedToEnqueue} failed to queue` : "") +
        ` (max publish lag ${Math.round(result.maxLagMs)}ms)`,
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
