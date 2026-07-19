import { describe, it, expect, vi } from "vitest";
import { deliver, runEvents, type DeliveryDeps } from "./scheduler.js";
import type { SimulationEvent } from "./events.js";

interface FetchOptions {
  signal?: AbortSignal;
}

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

  it("passes an abort signal so a hung endpoint can be timed out", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    await deliver(ev({}), baseDeps({ fetch }));
    const opts = (fetch as unknown as { mock: { calls: [string, FetchOptions][] } }).mock.calls[0][1];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts and fails a fetch that hangs past timeoutMs", async () => {
    vi.useFakeTimers();
    const fetch = ((_url: string, opts: FetchOptions) =>
      new Promise<Response>((_, reject) => {
        opts.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      })) as unknown as typeof fetch;
    const outcome = deliver(ev({}), baseDeps({ fetch, timeoutMs: 1000 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await outcome).toBe("failed");
    vi.useRealTimers();
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

  it("delivers concurrently, capped at maxConcurrency, and reports the peak", async () => {
    let inFlight = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fetch = vi.fn(async () => {
      inFlight += 1;
      await gate;
      inFlight -= 1;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const events = Array.from({ length: 5 }, (_, i) =>
      ev({ id: String(i), scheduledMicros: 0, targetUrl: "http://h" }),
    );

    const run = runEvents(events, 0, baseDeps({ fetch }), { maxConcurrency: 2 });
    // Loop saturates the cap, then blocks acquiring the next slot.
    await vi.waitFor(() => expect(inFlight).toBe(2));
    expect(inFlight).toBe(2); // never exceeds the cap
    release();

    const { counts, peakConcurrency } = await run;
    expect(counts.delivered).toBe(5);
    expect(peakConcurrency).toBe(2);
  });


  it("does not block the schedule on a slow delivery", async () => {
    // Two events scheduled at the same instant; the first delivery hangs until
    // released. A sequential runner would never dispatch the second, so the
    // second fetch firing proves deliveries overlap.
    let secondFired = false;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => { releaseFirst = r; });
    const fetch = vi.fn(async (url: string) => {
      if (url === "http://slow") { await firstGate; return new Response(null, { status: 200 }); }
      secondFired = true;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const events = [
      ev({ id: "slow", scheduledMicros: 0, targetUrl: "http://slow" }),
      ev({ id: "fast", scheduledMicros: 0, targetUrl: "http://fast" }),
    ];

    const run = runEvents(events, 0, baseDeps({ fetch }));
    await vi.waitFor(() => expect(secondFired).toBe(true));
    releaseFirst();
    const { counts } = await run;
    expect(counts.delivered).toBe(2);
  });
});
