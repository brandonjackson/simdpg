import { eq } from "drizzle-orm";
import { getDb, simulations, simulationRuns } from "./db.js";

export interface SimulationRunState {
  pid: number;
  status: "running" | "completed" | "stopped" | "failed";
  startedAt: string;
  completedAt?: string;
  error?: string;
  delivered: number;
  skipped: number;
  failed: number;
  total: number;
}

const TERMINAL: SimulationRunState["status"][] = ["completed", "stopped", "failed"];

/**
 * Persist the worker's run-state to the shared SQLite database.
 *
 * The run-state row (`simulation_runs`) is upserted every call — including the
 * initial `running` write and the terminal write — so pid, counts, and status
 * are always durable (no more single-writer JSON file). On a terminal status we
 * also update the authoritative `simulations` record in the SAME transaction,
 * stamping its status, stats, and end time. That is what lets the portal read a
 * consistent status from the record alone, with no read-time reconciliation.
 */
export async function writeRunState(id: string, state: SimulationRunState): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const runRow = {
    simulation_id: id,
    pid: state.pid,
    status: state.status,
    started_at: state.startedAt,
    completed_at: state.completedAt ?? null,
    error: state.error ?? null,
    delivered: state.delivered,
    skipped: state.skipped,
    failed: state.failed,
    total: state.total,
    updated_at: now,
  };

  db.transaction((tx) => {
    tx.insert(simulationRuns)
      .values(runRow)
      .onConflictDoUpdate({ target: simulationRuns.simulation_id, set: runRow })
      .run();

    if (!TERMINAL.includes(state.status)) return;

    const stats: Record<string, unknown> = {
      delivered: state.delivered,
      skipped: state.skipped,
      failed: state.failed,
      total: state.total,
    };
    if (state.error) stats.error = state.error;

    // Reflect the terminal outcome onto the record. UPDATE affects zero rows if
    // the simulation was deleted mid-run — a harmless no-op, not an error.
    tx.update(simulations)
      .set({
        status: state.status,
        stats: JSON.stringify(stats),
        updated_at: now,
        completed_at: state.status === "stopped" ? undefined : state.completedAt ?? null,
        stopped_at: state.status === "stopped" ? state.completedAt ?? null : undefined,
      })
      .where(eq(simulations.id, id))
      .run();
  });
}
