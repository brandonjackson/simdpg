/**
 * Integration test for the delivery pool against a REAL Redis.
 *
 * Skipped unless REDIS_URL is set, so `npm test` stays green without one. Start
 * the compose Redis first:
 *
 *   docker compose up -d redis
 *   REDIS_URL=redis://127.0.0.1:6379 npm run test -w @simdpg/simulation
 *
 * What it proves is the thing the pool exists for and that no unit test can
 * reach: two independent workers, each with its own Redis connections, split one
 * run's jobs between them and their counters still add up to exactly the run.
 * A double-delivery (pub/sub semantics instead of a work queue), a lost job, or
 * a per-worker counter would all show up here as a wrong total.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { startDeliveryPool, type DeliveryPool } from "./delivery-worker.js";
import {
  createRedis,
  markRunStopped,
  readRunCounters,
  resetRunCounters,
  type DeliveryJob,
} from "./queue.js";
import type { SimulationEvent } from "./events.js";

const REDIS_URL = process.env.REDIS_URL?.trim();
const describeIfRedis = REDIS_URL ? describe : describe.skip;

/** Real Redis and real HTTP — well past vitest's 5s default. */
const TIMEOUT_MS = 30_000;

/** Unique per run so repeated local runs never inherit a previous queue's jobs. */
const QUEUE = `sim:test:deliveries:${process.pid}`;

describeIfRedis("delivery pool (real Redis)", () => {
  let server: http.Server;
  let targetUrl: string;
  let received = 0;
  let redis: Redis;
  let queue: Queue<DeliveryJob>;
  const pools: DeliveryPool[] = [];

  function ev(i: number, url: string | null = targetUrl): SimulationEvent {
    return {
      id: `e${i}`,
      scheduledMicros: i,
      targetKey: "test",
      targetUrl: url,
      payload: { i },
    };
  }

  async function enqueue(simulationId: string, events: SimulationEvent[]): Promise<void> {
    await queue.addBulk(
      events.map((event) => ({
        name: "deliver",
        data: { simulationId, event },
        opts: { removeOnComplete: true },
      })),
    );
  }

  /** Poll until the pool has accounted for `expected` jobs, or fail loudly. */
  async function waitForTotal(simulationId: string, expected: number) {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const counters = await readRunCounters(redis, simulationId);
      const done = counters.delivered + counters.skipped + counters.failed;
      if (done >= expected) return counters;
      if (Date.now() >= deadline) {
        throw new Error(`timed out at ${done}/${expected}: ${JSON.stringify(counters)}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      req.resume();
      req.on("end", () => { received += 1; res.writeHead(204).end(); });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    targetUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

    redis = createRedis(REDIS_URL);
    queue = new Queue<DeliveryJob>(QUEUE, { connection: createRedis(REDIS_URL) });

    // Two workers, two sets of connections — a second container, minus the
    // container. Low concurrency so both are guaranteed a share of the work.
    for (let i = 0; i < 2; i++) {
      pools.push(startDeliveryPool({ queue: QUEUE, concurrency: 5, redisUrl: REDIS_URL }));
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    await Promise.all(pools.map((p) => p.close()));
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
    redis.disconnect();
    await new Promise<void>((r) => server.close(() => r()));
  }, TIMEOUT_MS);

  beforeEach(() => { received = 0; });

  it("aggregates counters across more than one worker, delivering each event once", async () => {
    const simulationId = `it-aggregate-${Date.now()}`;
    const count = 200;
    await resetRunCounters(redis, simulationId);

    const before = pools.map((p) => p.processed());
    await enqueue(simulationId, Array.from({ length: count }, (_, i) => ev(i)));
    const counters = await waitForTotal(simulationId, count);

    expect(counters).toEqual({ delivered: count, skipped: 0, failed: 0 });
    // Exactly once each: a fan-out transport would have delivered 2× this.
    expect(received).toBe(count);

    // Both workers took part — otherwise the aggregation above proves nothing.
    const handled = pools.map((p, i) => p.processed() - before[i]);
    expect(handled.every((n) => n > 0)).toBe(true);
    expect(handled.reduce((a, b) => a + b, 0)).toBe(count);
  }, TIMEOUT_MS);

  it("classifies unregistered targets as skips and unreachable ones as failures", async () => {
    const simulationId = `it-outcomes-${Date.now()}`;
    await resetRunCounters(redis, simulationId);

    await enqueue(simulationId, [
      ev(1),
      ev(2, null), // no webhook registered → skipped, never POSTed
      // Reserved-for-documentation address: connection is refused fast.
      ev(3, "http://127.0.0.1:1/hook"),
    ]);

    const counters = await waitForTotal(simulationId, 3);
    expect(counters).toEqual({ delivered: 1, skipped: 1, failed: 1 });
  }, TIMEOUT_MS);

  it("drops queued jobs for a run that was stopped", async () => {
    const simulationId = `it-stopped-${Date.now()}`;
    await resetRunCounters(redis, simulationId);
    await markRunStopped(redis, simulationId);

    await enqueue(simulationId, Array.from({ length: 20 }, (_, i) => ev(i)));
    const counters = await waitForTotal(simulationId, 20);

    expect(counters).toEqual({ delivered: 0, skipped: 20, failed: 0 });
    expect(received).toBe(0);
  }, TIMEOUT_MS);
});
