import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { SimulationRecord } from "./store";
import type { SimulationRunState } from "./run-state";

const originalCwd = process.cwd();
const originalSimDataDir = process.env.SIM_DATA_DIR;
let tempDir: string;

function baseRecord(id: string, over: Partial<SimulationRecord> = {}): SimulationRecord {
  return {
    id,
    createdAt: "t0",
    updatedAt: "t0",
    status: "running",
    parameters: { clockSpeed: 60, durationSeconds: 120, usesExistingPopulation: true },
    startedAt: "t1",
    ...over,
  };
}

async function writeSimulationsFile(records: SimulationRecord[]) {
  await fs.writeFile(
    path.join(tempDir, ".simulations.json"),
    JSON.stringify(records, null, 2),
    "utf8",
  );
}

async function writeRunState(id: string, runState: SimulationRunState) {
  const dir = path.join(tempDir, ".simulations");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${id}.run.json`),
    JSON.stringify(runState, null, 2),
    "utf8",
  );
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "simdpg-store-test-"));
  process.chdir(tempDir);
  process.env.SIM_DATA_DIR = tempDir;
  // store.ts computes SIMULATIONS_FILE from process.cwd() at module-eval
  // time, so the module cache must be cleared after each chdir to force
  // re-evaluation against the new tempDir.
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalSimDataDir === undefined) {
    delete process.env.SIM_DATA_DIR;
  } else {
    process.env.SIM_DATA_DIR = originalSimDataDir;
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("stopSimulation", () => {
  it("does not throw when the worker completed before the stop request lands (race)", async () => {
    const id = "race-1";
    await writeSimulationsFile([baseRecord(id, { status: "running" })]);
    await writeRunState(id, {
      // A pid guaranteed not to correspond to a live process, so
      // terminateWorker's process.kill throws and is swallowed.
      pid: 999999999,
      status: "completed",
      startedAt: "t1",
      completedAt: "t2",
      delivered: 10,
      skipped: 0,
      failed: 0,
      total: 10,
    });

    const { stopSimulation } = await import("./store");

    let result: SimulationRecord | null = null;
    await expect(
      (async () => {
        result = await stopSimulation(id);
      })(),
    ).resolves.not.toThrow();

    expect(result).not.toBeNull();
    expect(result!.status).toBe("completed");
    expect(result!.status).not.toBe("stopped");
  });

  it("rejects with SimulationTransitionError for a never-started (generated) simulation", async () => {
    const id = "never-started-1";
    await writeSimulationsFile([baseRecord(id, { status: "generated", startedAt: undefined })]);

    const { stopSimulation, SimulationTransitionError } = await import("./store");

    await expect(stopSimulation(id)).rejects.toThrow(SimulationTransitionError);
    await expect(stopSimulation(id)).rejects.toThrow("Only running simulations can be stopped");
  });
});
