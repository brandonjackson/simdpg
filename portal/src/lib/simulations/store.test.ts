import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { SimulationParameters } from "./store";
import { parseSimulationParameters } from "./store";
import { GENERATOR_CONFIG } from "./generators/config";
import {
  BEHAVIOR_OFF,
  behaviorPreset,
  isBehaviorOff,
} from "@simdpg/system-kit/behavior";

const PARAMS: SimulationParameters = {
  clockSpeed: 60,
  durationSeconds: 120,
  usesExistingPopulation: true,
  generatorConfig: GENERATOR_CONFIG,
  behavior: BEHAVIOR_OFF,
  projectId: "default",
  projectName: "Default project",
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

  it("deletes a simulation and its script, and reports missing on re-delete", async () => {
    const store = await loadStore();
    const script = await import("./script");
    const { eventsFilePath } = await import("./paths");
    const sim = await store.createSimulation(PARAMS);

    await script.writeScript(sim.id, [], null);
    await fs.mkdir(path.dirname(eventsFilePath(sim.id)), { recursive: true });
    await fs.writeFile(eventsFilePath(sim.id), "[]");

    expect(await store.deleteSimulation(sim.id)).toBe(true);
    expect(await store.getSimulation(sim.id)).toBeNull();
    expect(await script.readScript(sim.id)).toBeNull();
    await expect(fs.access(eventsFilePath(sim.id))).rejects.toThrow();
    expect(await store.deleteSimulation(sim.id)).toBe(false);
  });
});

describe("transitions", () => {
  it("generates a created simulation and rejects generating it twice", async () => {
    const store = await loadStore();
    const script = await import("./script");
    const sim = await store.createSimulation(PARAMS);

    const generated = await store.generateSimulation(sim.id);
    expect(generated?.status).toBe("generated");
    expect(generated?.generatedAt).toBeTruthy();

    // As the generate route does, before the record flips to `generated`.
    await script.writeScript(sim.id, [], null);

    await expect(store.generateSimulation(sim.id)).rejects.toThrow(
      store.SimulationTransitionError,
    );
  });

  // Nothing may generate over a run that is under way or already has results,
  // whatever status the caller claims to have seen.
  it("rejects generating a running or finished simulation", async () => {
    const store = await loadStore();
    const { db, simulations } = await loadDb();
    for (const status of ["running", "completed", "stopped"] as const) {
      db.insert(simulations)
        .values({
          id: status,
          created_at: "t0",
          updated_at: "t0",
          status,
          parameters: JSON.stringify(PARAMS),
          started_at: "t1",
        })
        .run();

      const record = (await store.getSimulation(status))!;
      expect(await store.canGenerate(record)).toBe(false);
      await expect(store.generateSimulation(status, status)).rejects.toThrow(
        store.SimulationTransitionError,
      );
    }
  });

  // How a redeploy used to leave things: the record survives on the volume, the
  // script it names does not. Generating again is the only way back, and there
  // is nothing to overwrite, so it is allowed.
  //
  // Ordered as the generate route orders it: the decision is made first, the
  // script is written second, and the transition is recorded last — so the
  // transition must not re-ask whether a script exists.
  it("regenerates a generated simulation whose script is missing", async () => {
    const store = await loadStore();
    const script = await import("./script");
    const sim = await store.createSimulation(PARAMS);
    await store.generateSimulation(sim.id);

    const record = (await store.getSimulation(sim.id))!;
    expect(await store.canGenerate(record)).toBe(true);
    await script.writeScript(sim.id, [], null);

    const regenerated = await store.generateSimulation(sim.id, record.status);
    expect(regenerated?.status).toBe("generated");
    expect(regenerated?.generatedAt).not.toBe(record.generatedAt);
  });

  it("refuses to regenerate a simulation whose script is intact", async () => {
    const store = await loadStore();
    const script = await import("./script");
    const sim = await store.createSimulation(PARAMS);
    await store.generateSimulation(sim.id);
    await script.writeScript(sim.id, [], null);

    expect(await store.canGenerate((await store.getSimulation(sim.id))!)).toBe(
      false,
    );
  });

  it("regenerates a failed simulation whose script is missing, clearing its stats", async () => {
    const store = await loadStore();
    const { db, simulations } = await loadDb();
    db.insert(simulations)
      .values({
        id: "lost-script",
        created_at: "t0",
        updated_at: "t2",
        status: "failed",
        parameters: JSON.stringify(PARAMS),
        started_at: "t1",
        completed_at: "t2",
        stats: JSON.stringify({
          delivered: 0,
          skipped: 0,
          failed: 0,
          total: 0,
          error: "This simulation has no event script to run.",
        }),
      })
      .run();

    const regenerated = await store.generateSimulation("lost-script", "failed");
    expect(regenerated?.status).toBe("generated");
    expect(regenerated?.stats).toBeUndefined();
    expect(regenerated?.startedAt).toBeUndefined();
    expect(regenerated?.completedAt).toBeUndefined();
  });

  // Starting it would spawn a worker that can only fail; saying so leaves the
  // record startable once it has been generated again.
  it("refuses to start a generated simulation whose script is missing", async () => {
    const store = await loadStore();
    const sim = await store.createSimulation(PARAMS);
    await store.generateSimulation(sim.id);

    await expect(store.startSimulation(sim.id)).rejects.toThrow(
      store.MISSING_SCRIPT_MESSAGE,
    );
    expect((await store.getSimulation(sim.id))?.status).toBe("generated");
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
  const base = {
    clockSpeed: 3600,
    durationSeconds: 86_400,
    projectId: "default",
    projectName: "Default project",
  };

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

describe("parseSimulationParameters behavior", () => {
  const base = {
    clockSpeed: 3600,
    durationSeconds: 86_400,
    projectId: "default",
    projectName: "Default project",
  };

  it("defaults to off, so a run leaves the systems alone", () => {
    const p = parseSimulationParameters(base);
    expect(p.behavior).toEqual(BEHAVIOR_OFF);
    expect(isBehaviorOff(p.behavior)).toBe(true);
  });

  it("keeps a preset's config verbatim", () => {
    const p = parseSimulationParameters({
      ...base,
      behavior: behaviorPreset("flaky")!.config,
    });
    expect(p.behavior).toEqual(behaviorPreset("flaky")!.config);
  });

  it("clamps a hand-edited config instead of rejecting it", () => {
    const p = parseSimulationParameters({
      ...base,
      behavior: { error_rate: 5, latency: { mean_ms: -20, stddev_ms: 100 } },
    });
    expect(p.behavior.error_rate).toBe(1);
    expect(p.behavior.latency.mean_ms).toBe(0);
    expect(p.behavior.latency.stddev_ms).toBe(100);
  });

  it("falls back to off for a malformed block", () => {
    const p = parseSimulationParameters({ ...base, behavior: "flaky" });
    expect(p.behavior).toEqual(BEHAVIOR_OFF);
  });
});

describe("parseSimulationParameters project", () => {
  const base = { clockSpeed: 3600, durationSeconds: 86_400 };

  it("keeps the project the caller resolved", () => {
    const p = parseSimulationParameters({
      ...base,
      projectId: "proj-2",
      projectName: "Training run 3",
    });
    expect(p.projectId).toBe("proj-2");
    expect(p.projectName).toBe("Training run 3");
  });

  // A run with no project would generate events with nowhere to deliver them,
  // so this is rejected rather than silently defaulted here — the API route
  // resolves the project (and 400s on an unknown one) before parsing.
  it("rejects parameters with no project", () => {
    expect(() => parseSimulationParameters(base)).toThrow("projectId is required");
    expect(() => parseSimulationParameters({ ...base, projectId: "  " })).toThrow(
      "projectId is required",
    );
  });

  it("falls back to the id when no project name is supplied", () => {
    const p = parseSimulationParameters({ ...base, projectId: "proj-3" });
    expect(p.projectName).toBe("proj-3");
  });
});
