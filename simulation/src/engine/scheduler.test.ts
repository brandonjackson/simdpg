import { describe, it, expect, vi } from "vitest";
import { deliver, runEvents, type DeliveryDeps } from "./scheduler.js";
import type { SimulationEvent } from "./events.js";

function ev(over: Partial<SimulationEvent>): SimulationEvent {
  return { id: "e", scheduledMicros: 0, targetKey: "national-id", targetUrl: "http://hook", payload: { a: 1 }, ...over };
}

function baseDeps(over: Partial<DeliveryDeps> = {}): DeliveryDeps {
  return {
    now: () => 0,
    sleep: async () => {},
    fetch: vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch,
    shouldStop: () => false,
    ...over,
  };
}

describe("deliver", () => {
  it("skips when targetUrl is null", async () => {
    const deps = baseDeps();
    const outcome = await deliver(ev({ targetUrl: null }), deps);
    expect(outcome).toBe("skipped");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("POSTs the payload and returns delivered on 2xx", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 202 })) as unknown as typeof fetch;
    const outcome = await deliver(ev({ targetUrl: "http://hook", payload: { x: 1 } }), baseDeps({ fetch }));
    expect(outcome).toBe("delivered");
    expect(fetch).toHaveBeenCalledWith(
      "http://hook",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ x: 1 }) }),
    );
  });

  it("returns failed on a non-2xx response", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await deliver(ev({}), baseDeps({ fetch }))).toBe("failed");
  });

  it("returns failed when fetch throws", async () => {
    const fetch = vi.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect(await deliver(ev({}), baseDeps({ fetch }))).toBe("failed");
  });
});

describe("runEvents", () => {
  it("delivers events in scheduledMicros order and counts outcomes", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (url: string) => { calls.push(url); return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    const events = [
      ev({ id: "b", scheduledMicros: 2000, targetUrl: "http://b" }),
      ev({ id: "a", scheduledMicros: 1000, targetUrl: "http://a" }),
      ev({ id: "c", scheduledMicros: 3000, targetUrl: null }),
    ];
    const { counts, stopped } = await runEvents(events, 0, baseDeps({ fetch }));
    expect(calls).toEqual(["http://a", "http://b"]);
    expect(counts).toEqual({ delivered: 2, skipped: 1, failed: 0, total: 3 });
    expect(stopped).toBe(false);
  });

  it("stops early without delivering remaining events", async () => {
    let stop = false;
    const fetch = vi.fn(async () => { stop = true; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    const events = [ev({ id: "a", scheduledMicros: 0 }), ev({ id: "b", scheduledMicros: 1000 })];
    const { counts, stopped } = await runEvents(events, 0, baseDeps({ fetch, shouldStop: () => stop }));
    expect(counts.delivered).toBe(1);
    expect(stopped).toBe(true);
  });
});
