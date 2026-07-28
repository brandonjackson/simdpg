import { describe, it, expect, vi } from "vitest";
import { deliver, type DeliveryDeps } from "./delivery.js";
import type { SimulationEvent } from "./events.js";

interface FetchOptions {
  signal?: AbortSignal;
}

function ev(over: Partial<SimulationEvent>): SimulationEvent {
  return { id: "e", scheduledMicros: 0, targetKey: "national-id", targetUrl: "http://hook", payload: { a: 1 }, ...over };
}

function baseDeps(over: Partial<DeliveryDeps> = {}): DeliveryDeps {
  return {
    fetch: vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch,
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
