import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { eventsFilePath } from "./paths.js";
import type { SimulationEvent } from "./events.js";
import type { CreateTransport } from "./worker.js";
import type { OutcomeCounts } from "./queue.js";

/**
 * A fake delivery pool: records the events runWorker publishes and reports a
 * scripted tally back, so runWorker's DB writes can be tested without a real
 * Redis or a consuming worker. The real end-to-end path is exercised by
 * worker.integration.test.ts against a live Redis.
 */
function fakeTransport(counts: OutcomeCounts) {
  const enqueued: SimulationEvent[] = [];
  const create: CreateTransport = () => ({
    reset: async () => {},
    enqueue: async (event) => { enqueued.push(event); },
    // Settled == enqueued once everything is published, so the drain returns.
    readCounts: async () => counts,
    close: async () => {},
  });
  return { create, enqueued };
}

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
  it("publishes every event and records terminal run-state from the pool's counters", async () => {
    const { runWorker, db, simulations, simulationRuns } = await load();
    seedRunning(db, simulations, "s1");

    await writeEvents("s1", [
      { id: "e1", scheduledMicros: 0, targetKey: "national-id", targetUrl: "http://hook", payload: { n: 1 } },
      { id: "e2", scheduledMicros: 0, targetKey: "national-id", targetUrl: null, payload: { n: 2 } },
    ]);

    // The pool reports one delivered, one skipped (the null-target event).
    const transport = fakeTransport({ delivered: 1, skipped: 1, failed: 0 });
    await runWorker("s1", transport.create);

    // Every event is published — the scheduler no longer decides "skipped" itself.
    expect(transport.enqueued.map((e) => e.id)).toEqual(["e1", "e2"]);

    // Worker-owned run-state row, built from the pool's counters.
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

  it("flushes live counts to the record mid-run, before the terminal write", async () => {
    const { runWorker, db, simulations } = await load();
    seedRunning(db, simulations, "live");
    await writeEvents("live", [
      { id: "e1", scheduledMicros: 0, targetKey: "national-id", targetUrl: "http://hook", payload: { n: 1 } },
      { id: "e2", scheduledMicros: 0, targetKey: "national-id", targetUrl: "http://hook", payload: { n: 2 } },
    ]);

    // The pool settles one job, then holds at 1 — so the run stays `running` and
    // the drain keeps polling while the ~1s flush timer fires at least once.
    let delivered = 1;
    const create: CreateTransport = () => ({
      reset: async () => {},
      enqueue: async () => {},
      readCounts: async () => ({ delivered, skipped: 0, failed: 0 }),
      close: async () => {},
    });

    let finished = false;
    const run = runWorker("live", create).then(() => { finished = true; });

    const stats = () => {
      const row = db.select().from(simulations).where(eq(simulations.id, "live")).get();
      return row?.stats ? JSON.parse(row.stats) : null;
    };

    // The live flush mirrors the running counts onto the record the portal reads,
    // before the run has finished.
    await vi.waitFor(
      () => expect(stats()).toEqual({ delivered: 1, skipped: 0, failed: 0, total: 2 }),
      { timeout: 4000, interval: 50 },
    );
    expect(finished).toBe(false);

    // Second job settles → drain completes → terminal write reconciles.
    delivered = 2;
    await run;

    const sim = db.select().from(simulations).where(eq(simulations.id, "live")).get();
    expect(sim?.status).toBe("completed");
    expect(JSON.parse(sim!.stats!)).toEqual({ delivered: 2, skipped: 0, failed: 0, total: 2 });
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
