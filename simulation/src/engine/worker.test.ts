import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
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
  const [{ runWorker }, { getDb, simulations, simulationRuns }, { setRedisForTesting }] =
    await Promise.all([
      import("./worker.js"),
      import("./db.js"),
      import("./redis.js"),
    ]);
  return { runWorker, db: getDb(), simulations, simulationRuns, setRedisForTesting };
}

/** Minimal in-memory stand-in for the shared Redis connection. */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      async set(key: string, value: string) { store.set(key, value); return "OK"; },
      async get(key: string) { return store.get(key) ?? null; },
      async del(key: string) { return store.delete(key) ? 1 : 0; },
      async quit() { return "OK"; },
      disconnect() {},
    },
  };
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

  it("raises the shared stop flag on SIGTERM and records stopped with partial counts", async () => {
    const { runWorker, db, simulations, simulationRuns, setRedisForTesting } = await load();
    seedRunning(db, simulations, "s2");
    const redis = fakeRedis();
    setRedisForTesting(redis.client as unknown as Redis);

    // Stop arrives while the first delivery is being handled, so the two later
    // events are still unsent when the scheduler quits publishing.
    const received: unknown[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push(JSON.parse(body));
        process.emit("SIGTERM", "SIGTERM");
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;

    await writeEvents("s2", [
      { id: "e1", scheduledMicros: 0, targetKey: "national-id", targetUrl: url, payload: { n: 1 } },
      { id: "e2", scheduledMicros: 200_000, targetKey: "national-id", targetUrl: url, payload: { n: 2 } },
      { id: "e3", scheduledMicros: 400_000, targetKey: "national-id", targetUrl: url, payload: { n: 3 } },
    ]);

    await runWorker("s2");
    await new Promise<void>((r) => server.close(() => r()));

    // The pool learns about the stop from Redis, not from the signal.
    expect(redis.store.get("sim:run:s2:stopped")).toBe("1");

    expect(received).toEqual([{ n: 1 }]);
    const run = db.select().from(simulationRuns).where(eq(simulationRuns.simulation_id, "s2")).get();
    expect(run?.status).toBe("stopped");
    expect(run).toMatchObject({ delivered: 1, skipped: 0, failed: 0, total: 3 });

    const sim = db.select().from(simulations).where(eq(simulations.id, "s2")).get();
    expect(sim?.status).toBe("stopped");
    expect(sim?.stopped_at).toBeTruthy();
    expect(JSON.parse(sim!.stats!)).toEqual({ delivered: 1, skipped: 0, failed: 0, total: 3 });
  });

  it("clears a previous run's stop flag before publishing", async () => {
    const { runWorker, db, simulations, setRedisForTesting } = await load();
    seedRunning(db, simulations, "s3");
    const redis = fakeRedis();
    // Left over from an earlier stopped run of the same simulation.
    redis.store.set("sim:run:s3:stopped", "1");
    setRedisForTesting(redis.client as unknown as Redis);

    await writeEvents("s3", [
      { id: "e1", scheduledMicros: 0, targetKey: "national-id", targetUrl: null, payload: { n: 1 } },
    ]);
    await runWorker("s3");

    expect(redis.store.has("sim:run:s3:stopped")).toBe(false);
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
