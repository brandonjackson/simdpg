import { describe, it, expect, vi } from "vitest";
import { runEvents, type RunDeps } from "./scheduler.js";
import type { ProgressSnapshot } from "./scheduler.js";
import type { OutcomeCounts } from "./queue.js";
import type { SimulationEvent } from "./events.js";

function ev(over: Partial<SimulationEvent>): SimulationEvent {
  return { id: "e", scheduledMicros: 0, targetKey: "national-id", targetUrl: "http://hook", payload: { a: 1 }, ...over };
}

function baseDeps(over: Partial<RunDeps> = {}): RunDeps {
  return {
    now: () => 0,
    sleep: async () => {},
    shouldStop: () => false,
    enqueue: async () => {},
    // Default: pretend everything settled so the drain phase returns at once.
    // Drain-specific tests override this to script the counter progression.
    readCounts: async () => ({ delivered: Number.MAX_SAFE_INTEGER, skipped: 0, failed: 0 }),
    ...over,
  };
}

describe("runEvents", () => {
  it("enqueues events in scheduledMicros order, including null-target events", async () => {
    const enqueued: string[] = [];
    const events = [
      ev({ id: "b", scheduledMicros: 2000, targetUrl: "http://b" }),
      ev({ id: "a", scheduledMicros: 1000, targetUrl: "http://a" }),
      ev({ id: "c", scheduledMicros: 3000, targetUrl: null }),
    ];
    const { enqueued: n, stopped } = await runEvents(
      events, 0, baseDeps({ enqueue: async (e) => { enqueued.push(e.id); } }),
    );
    // Every event is published — the worker, not the scheduler, decides "skipped".
    expect(enqueued).toEqual(["a", "b", "c"]);
    expect(n).toBe(3);
    expect(stopped).toBe(false);
  });

  it("sleeps until each event's scheduled moment before enqueuing", async () => {
    const sleeps: number[] = [];
    const events = [ev({ scheduledMicros: 3000 }), ev({ scheduledMicros: 1000 })];
    await runEvents(
      events, 100, baseDeps({ now: () => 100, sleep: async (ms) => { sleeps.push(ms); } }),
    );
    // Ordered to 1000, 3000 micros → target 101, 103 ms; waitMs from now=100 is 1, 3.
    expect(sleeps).toEqual([1, 3]);
  });

  it("stops publishing the moment shouldStop flips, and reports stopped", async () => {
    let stop = false;
    const enqueued: string[] = [];
    const events = [ev({ id: "a", scheduledMicros: 0 }), ev({ id: "b", scheduledMicros: 1000 })];
    const { enqueued: n, stopped } = await runEvents(
      events, 0,
      baseDeps({ enqueue: async (e) => { enqueued.push(e.id); stop = true; }, shouldStop: () => stop }),
    );
    expect(enqueued).toEqual(["a"]);
    expect(n).toBe(1);
    expect(stopped).toBe(true);
  });

  it("waits for the pool to settle every enqueued job, then returns the real counts", async () => {
    const events = Array.from({ length: 3 }, (_, i) => ev({ id: String(i), scheduledMicros: 0 }));
    // Counters climb across reads; runEvents must poll until settled reaches 3.
    const reads: OutcomeCounts[] = [
      { delivered: 0, skipped: 0, failed: 0 },
      { delivered: 1, skipped: 0, failed: 0 },
      { delivered: 2, skipped: 1, failed: 0 },
    ];
    let i = 0;
    const readCounts = vi.fn(async () => reads[Math.min(i++, reads.length - 1)]);
    const { counts } = await runEvents(events, 0, baseDeps({ readCounts }));
    expect(counts).toEqual({ delivered: 2, skipped: 1, failed: 0, total: 3 });
    expect(readCounts.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("emits progress snapshots from the first publish onward, carrying run-scoped depth", async () => {
    const events = [ev({ id: "a", scheduledMicros: 0 }), ev({ id: "b", scheduledMicros: 0 })];
    const reads: OutcomeCounts[] = [
      { delivered: 0, skipped: 0, failed: 0 },
      { delivered: 2, skipped: 0, failed: 0 },
    ];
    let i = 0;
    const snapshots: ProgressSnapshot[] = [];
    await runEvents(events, 0, baseDeps({
      readCounts: async () => reads[Math.min(i++, reads.length - 1)],
      onProgress: (s) => snapshots.push(s),
    }));
    // Progress starts during the publish phase, not only once draining begins —
    // publishing is the whole wall-clock span of a run.
    expect(snapshots[0]).toMatchObject({ enqueued: 1, total: 2, delivered: 0, depth: 1 });
    // Depth is this run's unsettled backlog: everything published, nothing settled.
    expect(snapshots[1]).toMatchObject({ enqueued: 2, depth: 2 });
    expect(snapshots[snapshots.length - 1]).toMatchObject({ enqueued: 2, delivered: 2, depth: 0 });
  });

  it("keeps publishing when an enqueue is rejected, and reports the loss", async () => {
    const events = ["a", "b", "c"].map((id, n) => ev({ id, scheduledMicros: n * 1000 }));
    const accepted: string[] = [];
    const { enqueued, failedToEnqueue, counts } = await runEvents(events, 0, baseDeps({
      enqueue: async (e) => {
        if (e.id === "b") throw new Error("redis down");
        accepted.push(e.id);
      },
      readCounts: async () => ({ delivered: 2, skipped: 0, failed: 0 }),
    }));
    // A rejected publish must not abort the run — throwing would discard every
    // outcome the pool already recorded and report the run as wholly failed.
    expect(accepted).toEqual(["a", "c"]);
    expect(enqueued).toBe(2);
    expect(failedToEnqueue).toBe(1);
    expect(counts).toEqual({ delivered: 2, skipped: 0, failed: 0, total: 3 });
  });

  it("gives up draining when the counters stop moving, instead of polling forever", async () => {
    let clock = 0;
    const events = [ev({ id: "a", scheduledMicros: 0 })];
    // The pool never settles the job: a job that dies outside deliver() — worker
    // OOM, unparseable payload — increments no counter, ever.
    const { counts, enqueued, drainStalled } = await runEvents(
      events,
      0,
      baseDeps({
        now: () => clock,
        sleep: async (ms) => { clock += ms; },
        readCounts: async () => ({ delivered: 0, skipped: 0, failed: 0 }),
      }),
      { drainPollMs: 10, drainStallMs: 100 },
    );
    expect(enqueued).toBe(1);
    expect(drainStalled).toBe(true);
    // Counts come back as a floor rather than the run hanging in `running`.
    expect(counts).toEqual({ delivered: 0, skipped: 0, failed: 0, total: 1 });
  });

  it("keeps draining while the counters are still advancing, however slowly", async () => {
    let clock = 0;
    const events = Array.from({ length: 3 }, (_, i) => ev({ id: String(i), scheduledMicros: 0 }));
    let delivered = 0;
    // One settles per poll — far apart, but never stalled, so the budget resets.
    const { counts, drainStalled } = await runEvents(
      events,
      0,
      baseDeps({
        now: () => clock,
        sleep: async (ms) => { clock += ms; },
        readCounts: async () => ({ delivered: delivered++, skipped: 0, failed: 0 }),
      }),
      { drainPollMs: 90, drainStallMs: 100 },
    );
    expect(drainStalled).toBe(false);
    expect(counts).toEqual({ delivered: 3, skipped: 0, failed: 0, total: 3 });
  });

  it("measures publish lag against each event's scheduled moment", async () => {
    let clock = 0;
    const events = [ev({ id: "a", scheduledMicros: 0 }), ev({ id: "b", scheduledMicros: 1000 })];
    const { maxLagMs } = await runEvents(events, 0, baseDeps({
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
      // Each publish costs a 5ms round trip, which the schedule never gets back.
      enqueue: async () => { clock += 5; },
    }));
    // "a" targets 0 and publishes at 5 (lag 5); "b" targets 1 and publishes at
    // 10 (lag 9) — the round trips accumulate as drift, which is the point.
    expect(maxLagMs).toBe(9);
  });
});
