import type { SimulationRecord } from "./store";
import type { SimulationRunState } from "./run-state";

/**
 * Reflect the worker's run-state onto a running simulation record. Replaces the
 * old wall-clock completion heuristic. Only running records are reconciled; a
 * missing/unparseable run-state (null) or a still-running worker is a no-op.
 */
export function reconcile(
  sim: SimulationRecord,
  runState: SimulationRunState | null,
): SimulationRecord {
  if (sim.status !== "running" || !runState || runState.status === "running") {
    return sim;
  }

  const stats: Record<string, unknown> = {
    delivered: runState.delivered,
    skipped: runState.skipped,
    failed: runState.failed,
    total: runState.total,
  };
  if (runState.error) stats.error = runState.error;

  if (runState.status === "stopped") {
    return { ...sim, status: "stopped", stoppedAt: runState.completedAt ?? sim.stoppedAt, stats };
  }
  // "completed" and "failed" are both terminal; map status through and stamp completedAt.
  return { ...sim, status: runState.status, completedAt: runState.completedAt, stats };
}
