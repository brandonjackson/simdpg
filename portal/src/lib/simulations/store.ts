import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { reconcile } from "./reconcile";
import { readRunState } from "./run-state";
import { eventsFilePath, runStateFilePath } from "./paths";

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

const SIMULATIONS_FILE = path.join(process.cwd(), ".simulations.json");
const MAX_SIMULATIONS = 100;

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

  return {
    clockSpeed,
    durationSeconds: parsePositiveInteger(
      raw.durationSeconds,
      "durationSeconds",
    ),
    usesExistingPopulation: true,
  };
}

async function readSimulations(): Promise<SimulationRecord[]> {
  try {
    const raw = await fs.readFile(SIMULATIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SimulationRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeSimulations(simulations: SimulationRecord[]): Promise<void> {
  await fs.writeFile(
    SIMULATIONS_FILE,
    JSON.stringify(simulations.slice(0, MAX_SIMULATIONS), null, 2),
    "utf8",
  );
}

export async function listSimulations(): Promise<SimulationRecord[]> {
  const simulations = await readSimulations();
  return Promise.all(
    simulations.map(async (sim) =>
      sim.status === "running" ? reconcile(sim, await readRunState(sim.id)) : sim,
    ),
  );
}

export async function getSimulation(id: string): Promise<SimulationRecord | null> {
  const simulations = await listSimulations();
  return simulations.find((simulation) => simulation.id === id) ?? null;
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

  const simulations = await listSimulations();
  await writeSimulations([simulation, ...simulations]);
  return simulation;
}

export async function deleteSimulation(id: string): Promise<boolean> {
  const simulations = await listSimulations();
  const next = simulations.filter((simulation) => simulation.id !== id);
  if (next.length === simulations.length) {
    return false;
  }
  await writeSimulations(next);
  await Promise.all([
    fs.rm(eventsFilePath(id), { force: true }),
    fs.rm(runStateFilePath(id), { force: true }),
  ]);
  return true;
}

async function updateSimulation(
  id: string,
  update: (simulation: SimulationRecord, now: string) => SimulationRecord,
): Promise<SimulationRecord | null> {
  const simulations = await listSimulations();
  const index = simulations.findIndex((simulation) => simulation.id === id);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const next = update(simulations[index], now);
  const updated = { ...next, updatedAt: now };
  simulations[index] = updated;
  await writeSimulations(simulations);
  return updated;
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

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
    env: { ...process.env, SIM_DATA_DIR: process.env.SIM_DATA_DIR ?? process.cwd() },
  });
  child.unref();
}

export async function startSimulation(id: string): Promise<SimulationRecord | null> {
  const updated = await updateSimulation(id, (simulation, now) => {
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

async function terminateWorker(id: string): Promise<void> {
  const runState = await readRunState(id);
  if (!runState?.pid) return;
  try {
    process.kill(runState.pid, "SIGTERM");
  } catch {
    // Worker already exited; reconciliation will surface its terminal state.
  }
}

export async function stopSimulation(id: string): Promise<SimulationRecord | null> {
  await terminateWorker(id);
  return updateSimulation(id, (simulation, now) => {
    if (simulation.status !== "running") {
      throw new SimulationTransitionError("Only running simulations can be stopped");
    }
    return { ...simulation, status: "stopped", stoppedAt: now };
  });
}