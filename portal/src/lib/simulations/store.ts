import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs, createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { simulations, simulationRuns } from "../db/schema";
import { eventsFilePath, logFilePath } from "./paths";
import { loadConfig, GENERATOR_CONFIG, type GeneratorConfig } from "./generators/config";

export const CLOCK_SPEED_OPTIONS = [1, 60, 3600, 86400] as const;

export type ClockSpeed = (typeof CLOCK_SPEED_OPTIONS)[number];

export type SimulationStatus =
  | "created"
  | "generated"
  | "running"
  | "stopped"
  | "completed"
  | "failed";

export interface SimulationParameters {
  clockSpeed: ClockSpeed;
  durationSeconds: number;
  usesExistingPopulation: true;
  generatorConfig: GeneratorConfig;
}

export interface SimulationRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: SimulationStatus;
  parameters: SimulationParameters;
  generatedAt?: string;
  startedAt?: string;
  stoppedAt?: string;
  completedAt?: string;
  stats?: Record<string, unknown>;
}

export class SimulationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationTransitionError";
  }
}

type SimulationRow = typeof simulations.$inferSelect;

function isClockSpeed(value: number): value is ClockSpeed {
  return CLOCK_SPEED_OPTIONS.includes(value as ClockSpeed);
}

function parsePositiveInteger(value: unknown, field: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return Math.round(numberValue);
}

export function parseSimulationParameters(input: unknown): SimulationParameters {
  const raw = (input ?? {}) as Partial<SimulationParameters>;
  const clockSpeed = Number(raw.clockSpeed);

  if (!isClockSpeed(clockSpeed)) {
    throw new Error(
      `clockSpeed must be one of ${CLOCK_SPEED_OPTIONS.join(", ")}`,
    );
  }

  const generatorConfig =
    raw.generatorConfig === undefined
      ? GENERATOR_CONFIG
      : loadConfig(raw.generatorConfig);

  return {
    clockSpeed,
    durationSeconds: parsePositiveInteger(
      raw.durationSeconds,
      "durationSeconds",
    ),
    usesExistingPopulation: true,
    generatorConfig,
  };
}

/** Map a DB row to the record shape the API and UI consume. */
function rowToRecord(row: SimulationRow): SimulationRecord {
  const record: SimulationRecord = {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    parameters: JSON.parse(row.parameters) as SimulationParameters,
  };
  if (row.generated_at) record.generatedAt = row.generated_at;
  if (row.started_at) record.startedAt = row.started_at;
  if (row.stopped_at) record.stoppedAt = row.stopped_at;
  if (row.completed_at) record.completedAt = row.completed_at;
  if (row.stats) record.stats = JSON.parse(row.stats) as Record<string, unknown>;
  return record;
}

/**
 * List simulations, newest first. Status and stats come straight from the
 * authoritative `simulations` row — the worker keeps terminal state current, so
 * no read-time reconciliation is needed.
 */
export async function listSimulations(): Promise<SimulationRecord[]> {
  const rows = getDb().select().from(simulations).orderBy(desc(simulations.created_at)).all();
  return rows.map(rowToRecord);
}

export async function getSimulation(id: string): Promise<SimulationRecord | null> {
  const row = getDb().select().from(simulations).where(eq(simulations.id, id)).get();
  return row ? rowToRecord(row) : null;
}

export async function createSimulation(
  parameters: SimulationParameters,
): Promise<SimulationRecord> {
  const now = new Date().toISOString();
  const simulation: SimulationRecord = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "created",
    parameters,
  };

  getDb().insert(simulations).values({
    id: simulation.id,
    created_at: now,
    updated_at: now,
    status: "created",
    parameters: JSON.stringify(parameters),
  }).run();

  return simulation;
}

export async function deleteSimulation(id: string): Promise<boolean> {
  const result = getDb().delete(simulations).where(eq(simulations.id, id)).run();
  if (result.changes === 0) {
    return false;
  }
  getDb().delete(simulationRuns).where(eq(simulationRuns.simulation_id, id)).run();
  await fs.rm(eventsFilePath(id), { force: true });
  return true;
}

/**
 * Atomically load a simulation, apply a transition, and persist it. The
 * transition callback may throw (e.g. SimulationTransitionError) to reject an
 * illegal state change; the transaction then rolls back. Returns null when the
 * simulation doesn't exist.
 */
function updateSimulation(
  id: string,
  update: (simulation: SimulationRecord, now: string) => SimulationRecord,
): SimulationRecord | null {
  return getDb().transaction((tx) => {
    const row = tx.select().from(simulations).where(eq(simulations.id, id)).get();
    if (!row) return null;

    const now = new Date().toISOString();
    const next = update(rowToRecord(row), now);
    const updated: SimulationRecord = { ...next, updatedAt: now };

    tx.update(simulations)
      .set({
        status: updated.status,
        parameters: JSON.stringify(updated.parameters),
        updated_at: now,
        generated_at: updated.generatedAt ?? null,
        started_at: updated.startedAt ?? null,
        stopped_at: updated.stoppedAt ?? null,
        completed_at: updated.completedAt ?? null,
        stats: updated.stats ? JSON.stringify(updated.stats) : null,
      })
      .where(eq(simulations.id, id))
      .run();

    return updated;
  });
}

export async function generateSimulation(
  id: string,
): Promise<SimulationRecord | null> {
  return updateSimulation(id, (simulation, now) => {
    if (simulation.status !== "created") {
      throw new SimulationTransitionError(
        "Only created simulations can be generated",
      );
    }

    return {
      ...simulation,
      status: "generated",
      generatedAt: now,
    };
  });
}

function spawnWorker(id: string): void {
  const entry =
    process.env.SIM_WORKER_ENTRY ??
    path.resolve(process.cwd(), "..", "simulation", "src", "index.ts");
  const command = process.env.SIM_WORKER_CMD ?? "npx";
  const args =
    process.env.SIM_WORKER_CMD ? [entry, "run", id] : ["tsx", entry, "run", id];

  // Tee the worker's output to both this terminal and a per-simulation log file
  // so a run's live progress (delivery concurrency, counts) is visible while it
  // runs and inspectable afterwards. Without this the worker's stdio was
  // discarded, so its logs went nowhere.
  const logPath = logFilePath(id);
  mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "a" });
  logStream.on("error", () => {}); // never let a log-write failure crash the portal

  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
    env: { ...process.env, SIM_DATA_DIR: process.env.SIM_DATA_DIR ?? process.cwd() },
  });

  const tee = (chunk: Buffer, term: NodeJS.WriteStream): void => {
    term.write(chunk);
    logStream.write(chunk);
  };
  child.stdout?.on("data", (c: Buffer) => tee(c, process.stdout));
  child.stderr?.on("data", (c: Buffer) => tee(c, process.stderr));
  child.stdout?.on("error", () => {});
  child.stderr?.on("error", () => {});
  child.once("exit", () => logStream.end());

  child.unref();
}

export async function startSimulation(id: string): Promise<SimulationRecord | null> {
  const updated = updateSimulation(id, (simulation, now) => {
    if (simulation.status !== "generated") {
      throw new SimulationTransitionError("Only generated simulations can be started");
    }
    return {
      ...simulation,
      status: "running",
      startedAt: now,
      stoppedAt: undefined,
      completedAt: undefined,
    };
  });

  if (updated) spawnWorker(id);
  return updated;
}

/** Look up the running worker's pid, if any, for a simulation. */
function runPid(id: string): number | null {
  const run = getDb()
    .select({ pid: simulationRuns.pid })
    .from(simulationRuns)
    .where(eq(simulationRuns.simulation_id, id))
    .get();
  return run?.pid ?? null;
}

function terminateWorker(id: string): void {
  const pid = runPid(id);
  if (!pid) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Worker already exited; its terminal run-state is already persisted.
  }
}

const TERMINAL_STATUSES: SimulationStatus[] = ["completed", "failed", "stopped"];

export async function stopSimulation(id: string): Promise<SimulationRecord | null> {
  const current = await getSimulation(id);
  if (!current) return null;

  // Idempotent stop: a record already in a terminal state is returned as-is,
  // including the race where the worker completed/failed just before the user
  // clicked Stop (the worker persists terminal state directly now).
  if (TERMINAL_STATUSES.includes(current.status)) {
    return current;
  }

  if (current.status !== "running") {
    throw new SimulationTransitionError("Only running simulations can be stopped");
  }

  terminateWorker(id);
  return updateSimulation(id, (simulation, now) => {
    if (simulation.status !== "running") {
      // The worker reached a terminal state between the check above and this
      // transaction; leave whatever it wrote in place.
      return simulation;
    }
    return { ...simulation, status: "stopped", stoppedAt: now };
  });
}

/**
 * Run-state rows still marked `running`. A crashed or abandoned worker leaves
 * its row here (its pid no longer alive), so a future reaper can query these
 * and flip them terminal — the file model had no way to detect this.
 */
export async function listRunningRuns(): Promise<
  { simulationId: string; pid: number | null; startedAt: string; updatedAt: string }[]
> {
  const rows = getDb()
    .select()
    .from(simulationRuns)
    .where(eq(simulationRuns.status, "running"))
    .all();
  return rows.map((r) => ({
    simulationId: r.simulation_id,
    pid: r.pid,
    startedAt: r.started_at,
    updatedAt: r.updated_at,
  }));
}
