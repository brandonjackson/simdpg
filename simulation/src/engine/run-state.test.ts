import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

let dir: string;

async function load() {
  const [{ flushRunProgress, writeRunState }, { getDb, simulations, simulationRuns }] = await Promise.all([
    import("./run-state.js"),
    import("./db.js"),
  ]);
  return { flushRunProgress, writeRunState, db: getDb(), simulations, simulationRuns };
}

function seed(
  db: Awaited<ReturnType<typeof load>>["db"],
  simulations: Awaited<ReturnType<typeof load>>["simulations"],
  id: string,
  status: string,
): void {
  db.insert(simulations)
    .values({
      id,
      created_at: "t0",
      updated_at: "t0",
      status,
      parameters: JSON.stringify({ clockSpeed: 60, durationSeconds: 120, usesExistingPopulation: true }),
      started_at: "t1",
    })
    .run();
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sim-runstate-"));
  process.env.SIM_DATA_DIR = dir;
  delete process.env.PORTAL_DB_FILE;
  vi.resetModules();
});
afterEach(async () => {
  delete process.env.SIM_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("flushRunProgress", () => {
  it("mirrors live counts onto the record the portal reads, while it is running", async () => {
    const { flushRunProgress, db, simulations, simulationRuns } = await load();
    seed(db, simulations, "r1", "running");

    await flushRunProgress("r1", { pid: 7, startedAt: "t1", delivered: 3, skipped: 1, failed: 0, total: 5 });

    // The record's stats blob is what the portal narrows via parseStats.
    const sim = db.select().from(simulations).where(eq(simulations.id, "r1")).get();
    expect(sim?.status).toBe("running");
    expect(JSON.parse(sim!.stats!)).toEqual({ delivered: 3, skipped: 1, failed: 0, total: 5 });

    // The worker-owned run-state row carries the same live counts.
    const run = db.select().from(simulationRuns).where(eq(simulationRuns.simulation_id, "r1")).get();
    expect(run).toMatchObject({ status: "running", delivered: 3, skipped: 1, failed: 0, total: 5 });
    expect(run?.completed_at).toBeNull();
  });

  it("does not touch a record that has already reached a terminal state", async () => {
    const { flushRunProgress, db, simulations } = await load();
    seed(db, simulations, "r2", "completed");

    await flushRunProgress("r2", { pid: 7, startedAt: "t1", delivered: 9, skipped: 9, failed: 9, total: 5 });

    // A late flush must not resurrect counts onto a finished record.
    const sim = db.select().from(simulations).where(eq(simulations.id, "r2")).get();
    expect(sim?.status).toBe("completed");
    expect(sim?.stats).toBeNull();
  });
});
