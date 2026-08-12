import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { eq } from "drizzle-orm";
import type { SimulationEvent } from "./events.js";

let dir: string;

/**
 * Load the worker and the shared DB against the current tempdir. getDb() opens
 * its connection (and creates the file) lazily, so each test resets the module
 * registry (in beforeEach) and imports fresh to get an isolated database.
 */
async function load() {
  const [{ runWorker }, { getDb, simulations, simulationRuns, simulationScripts }] =
    await Promise.all([import("./worker.js"), import("./db.js")]);
  return {
    runWorker,
    db: getDb(),
    simulations,
    simulationRuns,
    simulationScripts,
  };
}

/** Store a script the way the portal's generation step does. */
function writeScript(
  db: Awaited<ReturnType<typeof load>>["db"],
  simulationScripts: Awaited<ReturnType<typeof load>>["simulationScripts"],
  id: string,
  events: SimulationEvent[],
): void {
  db.insert(simulationScripts)
    .values({
      simulation_id: id,
      events: JSON.stringify(events),
      generation: null,
      updated_at: "t0",
    })
    .run();
}

/** Seed a running simulation record, as the portal would before spawning the worker. */
function seedRunning(
  db: Awaited<ReturnType<typeof load>>["db"],
  simulations: Awaited<ReturnType<typeof load>>["simulations"],
  id: string,
): void {
  db.insert(simulations)
    .values({
      id,
      created_at: "t0",
      updated_at: "t0",
      status: "running",
      parameters: JSON.stringify({ clockSpeed: 60, durationSeconds: 120, usesExistingPopulation: true }),
      started_at: "t1",
    })
    .run();
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sim-worker-"));
  process.env.SIM_DATA_DIR = dir;
  delete process.env.PORTAL_DB_FILE;
  vi.resetModules();
});
afterEach(async () => {
  delete process.env.SIM_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("runWorker", () => {
  it("delivers events, records completed run-state, and flips the record terminal", async () => {
    const { runWorker, db, simulations, simulationRuns, simulationScripts } =
      await load();
    seedRunning(db, simulations, "s1");

    const received: unknown[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => { received.push(JSON.parse(body)); res.writeHead(200).end(); });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;

    writeScript(db, simulationScripts, "s1", [
      { id: "e1", scheduledMicros: 0, targetKey: "national-id", targetUrl: url, payload: { n: 1 } },
      { id: "e2", scheduledMicros: 0, targetKey: "national-id", targetUrl: null, payload: { n: 2 } },
    ]);

    await runWorker("s1");
    await new Promise<void>((r) => server.close(() => r()));

    expect(received).toEqual([{ n: 1 }]);

    // Worker-owned run-state row.
    const run = db.select().from(simulationRuns).where(eq(simulationRuns.simulation_id, "s1")).get();
    expect(run?.status).toBe("completed");
    expect(run).toMatchObject({ delivered: 1, skipped: 1, failed: 0, total: 2 });
    expect(run?.completed_at).toBeTruthy();

    // Authoritative record a portal read would return — terminal status + counts,
    // no reconciliation needed.
    const sim = db.select().from(simulations).where(eq(simulations.id, "s1")).get();
    expect(sim?.status).toBe("completed");
    expect(JSON.parse(sim!.stats!)).toEqual({ delivered: 1, skipped: 1, failed: 0, total: 2 });
  });

  it("records failed run-state (and record) when there is no script", async () => {
    const { runWorker, db, simulations, simulationRuns } = await load();
    seedRunning(db, simulations, "missing");

    await runWorker("missing");

    const run = db.select().from(simulationRuns).where(eq(simulationRuns.simulation_id, "missing")).get();
    expect(run?.status).toBe("failed");
    // The run page shows this verbatim, so it says what to do rather than which
    // file could not be opened.
    expect(run?.error).toMatch(/Generate it again/);

    const sim = db.select().from(simulations).where(eq(simulations.id, "missing")).get();
    expect(sim?.status).toBe("failed");
  });
});
