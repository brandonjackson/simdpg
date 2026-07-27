import { describe, it, expect, vi } from "vitest";
import {
  deliver,
  runEvents,
  type DeliveryDeps,
  type DeliveryJob,
  type PublishDeps,
  type PublishSnapshot,
} from "./scheduler.js";
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

/** A queue that records what it was handed, standing in for the real pool. */
function fakeQueue(enqueue?: (job: DeliveryJob) => Promise<void>) {
  const jobs: DeliveryJob[] = [];
  return {
    jobs,
    enqueue: vi.fn(async (job: DeliveryJob) => {
      jobs.push(job);
      if (enqueue) await enqueue(job);
    }),
  };
}

/** A clock the test drives: sleeping advances it by exactly the requested ms. */
function fakeClock(overshootMs = 0) {
  let current = 0;
  const waits: number[] = [];
  return {
    waits,
    now: () => current,
    sleep: async (ms: number) => {
      waits.push(ms);
      current += ms + overshootMs;
    },
  };
}

function publishDeps(over: Partial<PublishDeps> = {}): PublishDeps {
  const clock = fakeClock();
  return {
    now: clock.now,
    sleep: clock.sleep,
    shouldStop: () => false,
    simulationId: "sim-1",
    queue: fakeQueue(),
    ...over,
  };
}

describe("runEvents", () => {
  it("publishes every event in scheduledMicros order", async () => {
    const queue = fakeQueue();
    const events = [
      ev({ id: "b", scheduledMicros: 2000 }),
      ev({ id: "a", scheduledMicros: 1000 }),
      ev({ id: "c", scheduledMicros: 3000 }),
    ];
    const result = await runEvents(events, 0, publishDeps({ queue }));
    expect(queue.jobs.map((j) => j.event.id)).toEqual(["a", "b", "c"]);
    expect(result).toMatchObject({ enqueued: 3, failedToEnqueue: 0, total: 3, stopped: false });
  });

  it("queues unregistered targets too — skipping is the consumer's call", async () => {
    const queue = fakeQueue();
    const events = [ev({ id: "a", targetUrl: null }), ev({ id: "b", targetUrl: "http://hook" })];
    await runEvents(events, 0, publishDeps({ queue }));
    expect(queue.jobs.map((j) => j.event.id)).toEqual(["a", "b"]);
  });

  it("stamps the simulation id on every job so outcomes can be attributed", async () => {
    const queue = fakeQueue();
    await runEvents([ev({ id: "a" }), ev({ id: "b" })], 0, publishDeps({ queue, simulationId: "sim-42" }));
    expect(queue.jobs.map((j) => j.simulationId)).toEqual(["sim-42", "sim-42"]);
  });

  it("publishes each event at its scheduled wall-clock moment", async () => {
    const clock = fakeClock();
    const events = [
      ev({ id: "a", scheduledMicros: 1_000 }),
      ev({ id: "b", scheduledMicros: 2_500 }),
      ev({ id: "c", scheduledMicros: 4_000 }),
    ];
    await runEvents(events, 0, publishDeps({ now: clock.now, sleep: clock.sleep }));
    // Targets 1ms, 2.5ms, 4ms from the run start — sleeps are the gaps between.
    expect(clock.waits).toEqual([1, 1.5, 1.5]);
  });

  it("does not sleep for events whose moment has already passed", async () => {
    const clock = fakeClock();
    const events = [ev({ id: "a", scheduledMicros: 0 }), ev({ id: "b", scheduledMicros: 0 })];
    await runEvents(events, 0, publishDeps({ now: clock.now, sleep: clock.sleep }));
    expect(clock.waits).toEqual([]);
  });

  it("reports how far behind schedule the publishes ran", async () => {
    const clock = fakeClock(5); // every sleep overshoots by 5ms
    const events = [ev({ id: "a", scheduledMicros: 1000 }), ev({ id: "b", scheduledMicros: 2000 })];
    const { maxLagMs } = await runEvents(events, 0, publishDeps({ now: clock.now, sleep: clock.sleep }));
    expect(maxLagMs).toBe(5);
  });

  it("keeps publishing on schedule while consumers lag — no backpressure", async () => {
    // Every enqueue hangs until released. With the old Promise.race cap the loop
    // would block after `maxConcurrency` jobs; the publisher must not stall.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const queue = fakeQueue(() => gate);
    const events = Array.from({ length: 50 }, (_, i) => ev({ id: String(i), scheduledMicros: i }));

    const run = runEvents(events, 0, publishDeps({ queue }));
    await vi.waitFor(() => expect(queue.enqueue).toHaveBeenCalledTimes(50));
    release();

    const { enqueued, peakPending } = await run;
    expect(enqueued).toBe(50);
    expect(peakPending).toBe(50); // all 50 published before any was acknowledged
  });

  it("waits for the queue to drain before reporting completion", async () => {
    let drained = false;
    let releaseDrain!: () => void;
    const drain = new Promise<void>((r) => { releaseDrain = r; });
    const queue = {
      ...fakeQueue(),
      waitForDrain: async () => { await drain; drained = true; },
    };

    const run = runEvents([ev({ id: "a" })], 0, publishDeps({ queue }));
    let finished = false;
    void run.then(() => { finished = true; });

    await vi.waitFor(() => expect(queue.jobs).toHaveLength(1));
    expect(finished).toBe(false); // published, but the queue is still draining

    releaseDrain();
    await run;
    expect(drained).toBe(true);
  });

  it("stops publishing the remaining events when asked to stop", async () => {
    let stop = false;
    const queue = fakeQueue(async () => { stop = true; });
    const events = [ev({ id: "a", scheduledMicros: 0 }), ev({ id: "b", scheduledMicros: 1000 })];
    const { enqueued, stopped } = await runEvents(events, 0, publishDeps({ queue, shouldStop: () => stop }));
    expect(enqueued).toBe(1);
    expect(queue.jobs.map((j) => j.event.id)).toEqual(["a"]);
    expect(stopped).toBe(true);
  });

  it("counts a rejected publish without aborting the run", async () => {
    const queue = fakeQueue(async (job) => {
      if (job.event.id === "b") throw new Error("redis down");
    });
    const events = ["a", "b", "c"].map((id, i) => ev({ id, scheduledMicros: i }));
    const { enqueued, failedToEnqueue, total } = await runEvents(events, 0, publishDeps({ queue }));
    expect(enqueued).toBe(2);
    expect(failedToEnqueue).toBe(1);
    expect(total).toBe(3);
  });

  it("reports progress snapshots as jobs are published and acknowledged", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const queue = fakeQueue(() => gate);
    const events = Array.from({ length: 4 }, (_, i) => ev({ id: String(i), scheduledMicros: i }));
    const snapshots: PublishSnapshot[] = [];

    const run = runEvents(events, 0, publishDeps({ queue, onProgress: (s) => snapshots.push({ ...s }) }));
    await vi.waitFor(() => expect(snapshots.some((s) => s.pending === 4)).toBe(true));
    release();
    await run;

    const last = snapshots[snapshots.length - 1];
    expect(last.pending).toBe(0);
    expect(last.enqueued).toBe(4);
    expect(last.total).toBe(4);
  });
});
