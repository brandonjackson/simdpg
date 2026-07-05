import { readEvents, type SimulationEvent } from "./events.js";
import { writeRunState, type SimulationRunState } from "./run-state.js";
import { runEvents, type RunCounts } from "./scheduler.js";
import { sleep, log, logError } from "../utils.js";

/**
 * Execute a generated simulation: schedule every event's POST by real time,
 * then record the terminal run-state. The portal reconciles the simulation
 * record from this file. Never throws — failures are written as run-state.
 */
export async function runWorker(id: string): Promise<void> {
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
  log(`Simulation ${id}: running ${events.length} events`);

  const finalize = async (status: SimulationRunState["status"], counts: RunCounts) => {
    await writeRunState(id, {
      pid: process.pid, status, startedAt, completedAt: new Date().toISOString(),
      delivered: counts.delivered, skipped: counts.skipped, failed: counts.failed, total: counts.total,
    });
  };

  try {
    const { counts, stopped: wasStopped } = await runEvents(events, Date.now(), {
      now: Date.now, sleep, fetch, shouldStop: () => stopped,
    });
    await finalize(wasStopped ? "stopped" : "completed", counts);
    log(`Simulation ${id}: ${wasStopped ? "stopped" : "completed"}`);
  } catch (err) {
    await writeRunState(id, {
      pid: process.pid, status: "failed", startedAt, completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      delivered: 0, skipped: 0, failed: 0, total: events.length,
    });
    logError(`Simulation ${id} crashed`, err);
  }
}
