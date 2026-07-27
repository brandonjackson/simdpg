import { describe, it, expect, vi } from "vitest";
import { handleDeliveryJob } from "./delivery-worker.js";
import type { DeliveryJob } from "./queue.js";
import type { SimulationEvent } from "./events.js";

function ev(over: Partial<SimulationEvent> = {}): SimulationEvent {
  return { id: "e", scheduledMicros: 0, targetKey: "national-id", targetUrl: "http://hook", payload: { a: 1 }, ...over };
}

function job(over: Partial<SimulationEvent> = {}): DeliveryJob {
  return { simulationId: "sim1", event: ev(over) };
}

/** Fake Redis exposing just the `incr` the handler uses, recording the keys. */
function fakeRedis() {
  const incr = vi.fn(async () => 1);
  return { incr };
}

describe("handleDeliveryJob", () => {
  it("delivers, returns 'delivered', and increments the delivered counter", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof globalThis.fetch;
    const redis = fakeRedis();
    const outcome = await handleDeliveryJob(job(), { fetch, redis });
    expect(outcome).toBe("delivered");
    expect(redis.incr).toHaveBeenCalledOnce();
    expect(redis.incr).toHaveBeenCalledWith("sim:run:sim1:delivered");
  });

  it("skips an unregistered target and increments the skipped counter", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof globalThis.fetch;
    const redis = fakeRedis();
    const outcome = await handleDeliveryJob(job({ targetUrl: null }), { fetch, redis });
    expect(outcome).toBe("skipped");
    expect(fetch).not.toHaveBeenCalled();
    expect(redis.incr).toHaveBeenCalledOnce();
    expect(redis.incr).toHaveBeenCalledWith("sim:run:sim1:skipped");
  });

  it("increments the failed counter on a non-2xx response", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof globalThis.fetch;
    const redis = fakeRedis();
    const outcome = await handleDeliveryJob(job(), { fetch, redis });
    expect(outcome).toBe("failed");
    expect(redis.incr).toHaveBeenCalledOnce();
    expect(redis.incr).toHaveBeenCalledWith("sim:run:sim1:failed");
  });

  it("increments the failed counter when fetch throws (never propagates)", async () => {
    const fetch = vi.fn(async () => { throw new Error("network"); }) as unknown as typeof globalThis.fetch;
    const redis = fakeRedis();
    const outcome = await handleDeliveryJob(job(), { fetch, redis });
    expect(outcome).toBe("failed");
    expect(redis.incr).toHaveBeenCalledOnce();
    expect(redis.incr).toHaveBeenCalledWith("sim:run:sim1:failed");
  });
});
