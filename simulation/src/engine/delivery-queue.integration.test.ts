/**
 * End-to-end check of the delivery pool against a real Redis: enqueue a job,
 * let a worker pop it, assert the POST landed and the counters moved.
 *
 * Skipped unless a Redis is reachable at REDIS_URL, so `npm test` stays
 * hermetic. To run it:  docker compose up -d redis && npm test -w @simdpg/simulation
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import IORedis from "ioredis";
import { createDeliveryQueue, type DeliveryJob } from "./delivery-queue.js";
import { startDeliveryWorker } from "./delivery-worker.js";
import { createRedis, redisUrlFromEnv, runCounterKey, runStoppedKey } from "./redis.js";

/** True if a Redis answers at REDIS_URL within a second. */
async function redisReachable(): Promise<boolean> {
  const probe = new IORedis(redisUrlFromEnv(), {
    lazyConnect: true,
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  // A refused connection is the expected "no Redis here" answer, not an error
  // worth printing; without a listener ioredis logs it as unhandled.
  probe.on("error", () => {});
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const hasRedis = await redisReachable();

describe.skipIf(!hasRedis)("delivery pool over a real Redis", () => {
  // Unique per run so a leftover key from an earlier run can't skew the counts.
  const simulationId = `it-${process.pid}-${process.hrtime.bigint()}`;
  const received: unknown[] = [];
  let hook: Server;
  let hookUrl: string;
  let redis: ReturnType<typeof createRedis>;

  beforeAll(async () => {
    hook = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((resolve) => hook.listen(0, "127.0.0.1", resolve));
    hookUrl = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/hook`;
    redis = createRedis();
  });

  afterAll(async () => {
    await redis?.del(
      runCounterKey(simulationId, "delivered"),
      runCounterKey(simulationId, "skipped"),
      runCounterKey(simulationId, "failed"),
      runStoppedKey(simulationId),
    );
    redis?.disconnect();
    await new Promise<void>((resolve) => hook.close(() => resolve()));
  });

  it("delivers a hand-enqueued job and increments the run's counters", async () => {
    const queue = createDeliveryQueue(createRedis());
    const worker = startDeliveryWorker({ concurrency: 4 });
    try {
      const jobs: DeliveryJob[] = [
        { simulationId, event: { id: "a", scheduledMicros: 0, targetKey: "national-id", targetUrl: hookUrl, payload: { n: 1 } } },
        { simulationId, event: { id: "b", scheduledMicros: 0, targetKey: "national-id", targetUrl: null, payload: { n: 2 } } },
      ];
      for (const job of jobs) await queue.add("deliver", job);

      await expect.poll(
        async () => ({
          delivered: await redis.get(runCounterKey(simulationId, "delivered")),
          skipped: await redis.get(runCounterKey(simulationId, "skipped")),
        }),
        { timeout: 10_000 },
      ).toEqual({ delivered: "1", skipped: "1" });

      expect(received).toEqual([{ n: 1 }]);
      expect(await redis.get(runCounterKey(simulationId, "failed"))).toBeNull();
    } finally {
      await worker.close();
      await queue.close();
    }
  }, 30_000);
});
