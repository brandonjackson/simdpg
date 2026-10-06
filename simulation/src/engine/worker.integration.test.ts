import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { eventsFilePath } from "./paths.js";
import type { SimulationEvent } from "./events.js";

/**
 * End-to-end coverage of the queue path: the real runWorker (producer) publishes
 * to a live Redis, a real two-worker pool consumes and POSTs, workers INCR the
 * counters, and runWorker drains and writes the aggregated terminal state.
 *
 * Gated on REDIS_URL so the normal `npm test` skips it (no Redis dependency).
 * Run it with a live server, e.g.:
 *   REDIS_URL=redis://localhost:6379 npm test -w @simdpg/simulation
 * When CI gains a Redis service, setting REDIS_URL in that job turns it on with
 * no code change.
 */
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!REDIS_URL)("runWorker (integration: real Redis + worker pool)", () => {
  let dir: string;

  async function writeEvents(id: string, events: SimulationEvent[]): Promise<void> {
    await fs.mkdir(path.join(dir, ".simulations"), { recursive: true });
    await fs.writeFile(eventsFilePath(id), JSON.stringify(events));
  }

  async function load() {
    const [
      { runWorker },
      { startDeliveryWorker },
      { createRedis },
      { createDeliveryQueue },
      { getDb, simulations, simulationRuns },
    ] = await Promise.all([
      import("./worker.js"),
      import("./delivery-worker.js"),
      import("./redis.js"),
      import("./queue.js"),
      import("./db.js"),
    ]);
    return { runWorker, startDeliveryWorker, createRedis, createDeliveryQueue, db: getDb(), simulations, simulationRuns };
  }

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
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "sim-worker-int-"));
    process.env.SIM_DATA_DIR = dir;
    delete process.env.PORTAL_DB_FILE;
    vi.resetModules();
  });
  afterEach(async () => {
    delete process.env.SIM_DATA_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("publishes to the pool, which delivers and tallies across two workers, then records terminal counts", async () => {
    const { runWorker, startDeliveryWorker, createRedis, createDeliveryQueue, db, simulations, simulationRuns } =
      await load();
    seedRunning(db, simulations, "int1");

    const received: unknown[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => { received.push(JSON.parse(body)); res.writeHead(200).end(); });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // Clear any jobs a previous run left on the shared queue.
    const adminConn = createRedis();
    const adminQueue = createDeliveryQueue(adminConn);
    await adminQueue.obliterate({ force: true });
    await adminQueue.close();
    await adminConn.quit();

    // Two workers on the shared queue — the point of the test is that the
    // counters aggregate correctly across more than one consumer.
    const workerConns = [createRedis(), createRedis()];
    const counterConns = [createRedis(), createRedis()];
    const workers = [
      startDeliveryWorker({ connection: workerConns[0], counters: counterConns[0], concurrency: 5 }),
      startDeliveryWorker({ connection: workerConns[1], counters: counterConns[1], concurrency: 5 }),
    ];

    await writeEvents("int1", [
      { id: "e1", scheduledMicros: 0, targetKey: "national-id", targetUrl: url, payload: { n: 1 } },
      { id: "e2", scheduledMicros: 1000, targetKey: "national-id", targetUrl: url, payload: { n: 2 } },
      { id: "e3", scheduledMicros: 2000, targetKey: "national-id", targetUrl: null, payload: { n: 3 } },
    ]);

    // Real transport (default): publishes to Redis, the pool above drains it.
    await runWorker("int1");

    await Promise.all(workers.map((w) => w.close()));
    await Promise.all([...workerConns, ...counterConns].map((c) => c.quit()));
    await new Promise<void>((r) => server.close(() => r()));

    // Two events had a target and were delivered; the null-target one was skipped.
    expect(received).toHaveLength(2);

    const run = db.select().from(simulationRuns).where(eq(simulationRuns.simulation_id, "int1")).get();
    expect(run?.status).toBe("completed");
    expect(run).toMatchObject({ delivered: 2, skipped: 1, failed: 0, total: 3 });
    expect(run?.completed_at).toBeTruthy();

    const sim = db.select().from(simulations).where(eq(simulations.id, "int1")).get();
    expect(sim?.status).toBe("completed");
    expect(JSON.parse(sim!.stats!)).toEqual({ delivered: 2, skipped: 1, failed: 0, total: 3 });
  }, 20_000);

  it("stops a run mid-flight: SIGTERM halts publishing, workers skip queued jobs, partial counts are recorded", async () => {
    const { runWorker, startDeliveryWorker, createRedis, createDeliveryQueue, db, simulations, simulationRuns } =
      await load();
    seedRunning(db, simulations, "stop1");

    // Slow webhook so jobs stay in-flight and some stay queued when we stop.
    let delivered = 0;
    const server = http.createServer((_req, res) => {
      setTimeout(() => { delivered += 1; res.writeHead(200).end(); }, 400);
    });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // Clear any jobs a previous run left on the shared queue.
    const adminConn = createRedis();
    const adminQueue = createDeliveryQueue(adminConn);
    await adminQueue.obliterate({ force: true });
    await adminQueue.close();
    await adminConn.quit();

    // 2 workers, concurrency 2 = 4 in-flight max. 6 jobs at t=0 means 2 stay
    // queued; a 7th at t=300ms gives a publish window to SIGTERM inside.
    const workerConns = [createRedis(), createRedis()];
    const counterConns = [createRedis(), createRedis()];
    const workers = [
      startDeliveryWorker({ connection: workerConns[0], counters: counterConns[0], concurrency: 2 }),
      startDeliveryWorker({ connection: workerConns[1], counters: counterConns[1], concurrency: 2 }),
    ];

    await writeEvents("stop1", [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, scheduledMicros: 0, targetKey: "national-id", targetUrl: url, payload: { i } })),
      { id: "e6", scheduledMicros: 300_000, targetKey: "national-id", targetUrl: url, payload: { i: 6 } },
    ]);

    // The scheduler is this process; its SIGTERM handler is what the portal's
    // terminateWorker triggers. Fire it in-process once the run is underway and
    // some jobs are queued.
    const run = runWorker("stop1");
    await vi.waitFor(
      () => expect(db.select().from(simulationRuns).where(eq(simulationRuns.simulation_id, "stop1")).get()?.status).toBe("running"),
      { timeout: 4000, interval: 50 },
    );
    await new Promise((r) => setTimeout(r, 150)); // let some jobs queue/in-flight
    process.emit("SIGTERM");
    await run;

    await Promise.all(workers.map((w) => w.close()));
    await Promise.all([...workerConns, ...counterConns].map((c) => c.quit()));
    await new Promise<void>((r) => server.close(() => r()));

    const runRow = db.select().from(simulationRuns).where(eq(simulationRuns.simulation_id, "stop1")).get();
    expect(runRow?.status).toBe("stopped");
    // Every enqueued job settled (drain completed), so the counts are accurate.
    expect(runRow!.delivered + runRow!.skipped + runRow!.failed).toBe(6);
    expect(runRow!.total).toBe(7);
    // The stop flag skipped queued jobs: not all 6 enqueued were POSTed.
    expect(delivered).toBe(runRow!.delivered);
    expect(delivered).toBeLessThan(6);
    expect(runRow!.skipped).toBeGreaterThan(0);

    const sim = db.select().from(simulations).where(eq(simulations.id, "stop1")).get();
    expect(sim?.status).toBe("stopped");
  }, 30_000);
});
