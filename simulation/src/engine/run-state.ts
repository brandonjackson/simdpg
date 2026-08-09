import { and, eq } from "drizzle-orm";
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

/** The counts a live progress flush carries — the terminal `stats` shape minus
 * `error`, which only a terminal state has. */
export interface RunProgress {
  pid: number;
  startedAt: string;
  delivered: number;
  skipped: number;
  failed: number;
  total: number;
}

/**
 * Flush live counts mid-run so the portal shows progress before the run ends.
 *
 * With N workers no single process holds the counts, so the scheduler reads them
 * from Redis and calls this on a ~1s timer. Two writes in one transaction:
 *   - the worker-owned `simulation_runs` row keeps its authoritative running counts;
 *   - the `simulations` record's `stats` blob is mirrored **only while the record
 *     is still `running`**, because that blob is the single field the portal reads
 *     for counts (`parseStats`). The `running` guard means a late flush can't
 *     resurrect counts onto a record that already finished (the design doc's
 *     "flush to `simulation_runs`, portal reads that row" is not how this portal
 *     reads — it reads the record — so the mirror is what makes counts visible).
 *
 * Deliberately does not touch status or the terminal stamps — `writeRunState`
 * owns those. Non-terminal, so it never writes `completed_at`/`stopped_at`.
 */
export async function flushRunProgress(id: string, progress: RunProgress): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const stats = {
    delivered: progress.delivered,
    skipped: progress.skipped,
    failed: progress.failed,
    total: progress.total,
  };

  const runRow = {
    simulation_id: id,
    pid: progress.pid,
    status: "running" as const,
    started_at: progress.startedAt,
    completed_at: null,
    error: null,
    delivered: progress.delivered,
    skipped: progress.skipped,
    failed: progress.failed,
    total: progress.total,
    updated_at: now,
  };

  db.transaction((tx) => {
    tx.insert(simulationRuns)
      .values(runRow)
      .onConflictDoUpdate({ target: simulationRuns.simulation_id, set: runRow })
      .run();

    tx.update(simulations)
      .set({ stats: JSON.stringify(stats), updated_at: now })
      .where(and(eq(simulations.id, id), eq(simulations.status, "running")))
      .run();
  });
}

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
