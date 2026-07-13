import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { SimulationParameters } from "./store";
import { parseSimulationParameters } from "./store";
import { GENERATOR_CONFIG } from "./generators/config";

const PARAMS: SimulationParameters = {
  clockSpeed: 60,
  durationSeconds: 120,
  usesExistingPopulation: true,
  generatorConfig: GENERATOR_CONFIG,
};

let tempDir: string;
const origDbFile = process.env.PORTAL_DB_FILE;
const origSimDataDir = process.env.SIM_DATA_DIR;

// The db module opens its connection from PORTAL_DB_FILE on first use, so each
// test points it at a fresh temp file and resets the module registry before
// dynamically importing the store (the cached connection lives in module state).
beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "simdpg-store-test-"));
  process.env.PORTAL_DB_FILE = path.join(tempDir, "test.sqlite");
  process.env.SIM_DATA_DIR = tempDir;
  vi.resetModules();
});

afterEach(async () => {
  if (origDbFile === undefined) delete process.env.PORTAL_DB_FILE;
  else process.env.PORTAL_DB_FILE = origDbFile;
  if (origSimDataDir === undefined) delete process.env.SIM_DATA_DIR;
  else process.env.SIM_DATA_DIR = origSimDataDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function loadStore() {
  return import("./store");
}

async function loadDb() {
  const [{ getDb }, schema] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/schema"),
  ]);
  return { db: getDb(), ...schema };
}

describe("store CRUD", () => {
  it("creates, reads, and lists a simulation", async () => {
    const store = await loadStore();
    const sim = await store.createSimulation(PARAMS);
    expect(sim.status).toBe("created");

    const got = await store.getSimulation(sim.id);
    expect(got?.id).toBe(sim.id);
    expect(got?.parameters).toEqual(PARAMS);

    const list = await store.listSimulations();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(sim.id);
  });

  it("deletes a simulation and its events file, and reports missing on re-delete", async () => {
    const store = await loadStore();
    const { eventsFilePath } = await import("./paths");
    const sim = await store.createSimulation(PARAMS);

    await fs.mkdir(path.dirname(eventsFilePath(sim.id)), { recursive: true });
    await fs.writeFile(eventsFilePath(sim.id), "[]");

    expect(await store.deleteSimulation(sim.id)).toBe(true);
    expect(await store.getSimulation(sim.id)).toBeNull();
    await expect(fs.access(eventsFilePath(sim.id))).rejects.toThrow();
    expect(await store.deleteSimulation(sim.id)).toBe(false);
  });
});

describe("transitions", () => {
  it("generates a created simulation and rejects generating it twice", async () => {
    const store = await loadStore();
    const sim = await store.createSimulation(PARAMS);

    const generated = await store.generateSimulation(sim.id);
    expect(generated?.status).toBe("generated");
    expect(generated?.generatedAt).toBeTruthy();

    await expect(store.generateSimulation(sim.id)).rejects.toThrow(
      store.SimulationTransitionError,
    );
  });

  it("rejects stopping a never-started (generated) simulation", async () => {
    const store = await loadStore();
    const sim = await store.createSimulation(PARAMS);
    await store.generateSimulation(sim.id);

    await expect(store.stopSimulation(sim.id)).rejects.toThrow(
      store.SimulationTransitionError,
    );
    await expect(store.stopSimulation(sim.id)).rejects.toThrow(
      "Only running simulations can be stopped",
    );
  });

  it("returns a terminal record unchanged when Stop lands after the worker finished (race)", async () => {
    const store = await loadStore();
    const { db, simulations, simulationRuns } = await loadDb();

    // The worker persisted a completed record + run row before the Stop click.
    db.insert(simulations)
      .values({
        id: "race-1",
        created_at: "t0",
        updated_at: "t2",
        status: "completed",
        parameters: JSON.stringify(PARAMS),
        started_at: "t1",
        completed_at: "t2",
        stats: JSON.stringify({ delivered: 10, skipped: 0, failed: 0, total: 10 }),
      })
      .run();
    db.insert(simulationRuns)
      .values({
        simulation_id: "race-1",
        pid: 999999999,
        status: "completed",
        started_at: "t1",
        completed_at: "t2",
        delivered: 10,
        skipped: 0,
        failed: 0,
        total: 10,
        updated_at: "t2",
      })
      .run();

    const result = await store.stopSimulation("race-1");
    expect(result?.status).toBe("completed");
    expect(result?.status).not.toBe("stopped");
  });
});

describe("listRunningRuns (crash detection)", () => {
  it("surfaces run rows still marked running so a reaper can find abandoned workers", async () => {
    const store = await loadStore();
    const { db, simulations, simulationRuns } = await loadDb();

    db.insert(simulations)
      .values({
        id: "r1",
        created_at: "t0",
        updated_at: "t0",
        status: "running",
        parameters: JSON.stringify(PARAMS),
        started_at: "t1",
      })
      .run();
    db.insert(simulationRuns)
      .values({
        simulation_id: "r1",
        pid: 999999999,
        status: "running",
        started_at: "t1",
        delivered: 0,
        skipped: 0,
        failed: 0,
        total: 5,
        updated_at: "t1",
      })
      .run();

    const running = await store.listRunningRuns();
    expect(running).toHaveLength(1);
    expect(running[0].simulationId).toBe("r1");
    expect(running[0].pid).toBe(999999999);
  });
});

describe("parseSimulationParameters generatorConfig", () => {
  const base = { clockSpeed: 3600, durationSeconds: 86_400 };

  it("defaults generatorConfig to the live config when omitted", () => {
    const p = parseSimulationParameters(base);
    expect(p.generatorConfig).toEqual(GENERATOR_CONFIG);
  });

  it("accepts and clamps a provided generatorConfig", () => {
    const p = parseSimulationParameters({
      ...base,
      generatorConfig: {
        marriage: { dailyRatePerPopulation: -1 },
        benefits: { chainProbabilities: { toStep2: 1.5 } },
      },
    });
    expect(p.generatorConfig.marriage.dailyRatePerPopulation).toBe(0);
    expect(p.generatorConfig.benefits.chainProbabilities.toStep2).toBe(1);
  });
});
