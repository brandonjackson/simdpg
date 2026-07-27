import { describe, it, expect, vi } from "vitest";
import { createInProcessQueue } from "./in-process-queue.js";
import type { DeliveryJob, EventOutcome } from "./scheduler.js";
import type { SimulationEvent } from "./events.js";

function job(over: Partial<SimulationEvent>): DeliveryJob {
  return {
    simulationId: "sim-1",
    event: { id: "e", scheduledMicros: 0, targetKey: "national-id", targetUrl: "http://hook", payload: { a: 1 }, ...over },
  };
}

const ok = () => vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

describe("createInProcessQueue", () => {
  it("delivers queued jobs and tallies their outcomes", async () => {
    const fetch = vi.fn(async (url: string) =>
      new Response(null, { status: url === "http://bad" ? 500 : 200 }),
    ) as unknown as typeof fetch;
    const queue = createInProcessQueue({ fetch });

    await queue.enqueue(job({ id: "a", targetUrl: "http://hook" }));
    await queue.enqueue(job({ id: "b", targetUrl: null }));
    await queue.enqueue(job({ id: "c", targetUrl: "http://bad" }));
    await queue.waitForDrain();

    expect(queue.counts()).toEqual({ delivered: 1, skipped: 1, failed: 1 });
  });

  it("holds the delivery concurrency cap the publish loop no longer owns", async () => {
    let inFlight = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fetch = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await gate;
      inFlight -= 1;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const queue = createInProcessQueue({ fetch }, { concurrency: 2 });

    for (let i = 0; i < 5; i++) await queue.enqueue(job({ id: String(i) }));
    await vi.waitFor(() => expect(inFlight).toBe(2));
    expect(queue.depth()).toBe(5); // two running, three still waiting
    release();

    await queue.waitForDrain();
    expect(peak).toBe(2);
    expect(queue.counts().delivered).toBe(5);
  });

  it("resolves waitForDrain only once every job has finished", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fetch = vi.fn(async () => { await gate; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    const queue = createInProcessQueue({ fetch });

    await queue.enqueue(job({ id: "a" }));
    let drained = false;
    const wait = queue.waitForDrain().then(() => { drained = true; });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(drained).toBe(false);

    release();
    await wait;
    expect(queue.depth()).toBe(0);
  });

  it("resolves waitForDrain immediately when nothing is queued", async () => {
    await expect(createInProcessQueue({ fetch: ok() }).waitForDrain()).resolves.toBeUndefined();
  });

  it("drops still-queued jobs once the run is stopped", async () => {
    let stopped = false;
    const fetch = vi.fn(async () => { stopped = true; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    const queue = createInProcessQueue({ fetch }, { concurrency: 1, shouldStop: () => stopped });

    for (let i = 0; i < 4; i++) await queue.enqueue(job({ id: String(i) }));
    await queue.waitForDrain();

    // The first job flips the stop flag; the rest are abandoned undelivered.
    expect(queue.counts()).toEqual({ delivered: 1, skipped: 0, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports each outcome to onOutcome as it lands", async () => {
    const outcomes: EventOutcome[] = [];
    const queue = createInProcessQueue({ fetch: ok() }, { onOutcome: (o) => outcomes.push(o) });
    await queue.enqueue(job({ id: "a" }));
    await queue.enqueue(job({ id: "b", targetUrl: null }));
    await queue.waitForDrain();
    expect(outcomes.sort()).toEqual(["delivered", "skipped"]);
  });
});
