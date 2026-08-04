import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { eq } from "drizzle-orm";
import { eventsFilePath } from "./paths.js";
import type { SimulationEvent } from "./events.js";

let dir: string;

async function writeEvents(id: string, events: SimulationEvent[]): Promise<void> {
  await fs.mkdir(path.join(dir, ".simulations"), { recursive: true });
  await fs.writeFile(eventsFilePath(id), JSON.stringify(events));
}

/**
 * Load the worker and the shared DB against the current tempdir. getDb() opens
 * its connection (and creates the file) lazily, so each test resets the module
 * registry (in beforeEach) and imports fresh to get an isolated database.
 */
async function load() {
  const [{ runWorker }, { getDb, simulations, simulationRuns }] = await Promise.all([
    import("./worker.js"),
    import("./db.js"),
  ]);
  return { runWorker, db: getDb(), simulations, simulationRuns };
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
    const { runWorker, db, simulations, simulationRuns } = await load();
    seedRunning(db, simulations, "s1");

    const received: unknown[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => { received.push(JSON.parse(body)); res.writeHead(200).end(); });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;

    await writeEvents("s1", [
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

  it("flushes live counts to the run row while the run is still going", async () => {
    // The portal renders whatever this row says, so the row moving mid-run *is*
    // live progress in the UI — with no portal change of any kind.
    process.env.SIM_STATE_FLUSH_MS = "50";
    const { runWorker, db, simulations, simulationRuns } = await load();
    seedRunning(db, simulations, "live");

    const server = http.createServer((req, res) => {
      req.resume();
      req.on("end", () => res.writeHead(200).end());
    });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;

    // Second event lands 400ms in, so the run outlives several flushes.
    await writeEvents("live", [
      { id: "e1", scheduledMicros: 0, targetKey: "national-id", targetUrl: url, payload: { n: 1 } },
      { id: "e2", scheduledMicros: 400_000, targetKey: "national-id", targetUrl: url, payload: { n: 2 } },
    ]);

    const running = runWorker("live");
    const row = () =>
      db.select().from(simulationRuns).where(eq(simulationRuns.simulation_id, "live")).get();
    await vi.waitFor(
      () => expect(row()).toMatchObject({ status: "running", delivered: 1, total: 2 }),
      { timeout: 2000, interval: 20 },
    );

    await running;
    await new Promise<void>((r) => server.close(() => r()));

    expect(row()).toMatchObject({ status: "completed", delivered: 2, total: 2 });
    delete process.env.SIM_STATE_FLUSH_MS;
  });

  it("records failed run-state (and record) when the events file is missing", async () => {
    const { runWorker, db, simulations, simulationRuns } = await load();
    seedRunning(db, simulations, "missing");

    await runWorker("missing");

    const run = db.select().from(simulationRuns).where(eq(simulationRuns.simulation_id, "missing")).get();
    expect(run?.status).toBe("failed");
    expect(run?.error).toBeTruthy();

    const sim = db.select().from(simulations).where(eq(simulations.id, "missing")).get();
    expect(sim?.status).toBe("failed");
  });
});
