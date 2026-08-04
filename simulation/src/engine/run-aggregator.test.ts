import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RunStateAggregator,
  type AggregatorDeps,
  type AggregatorOptions,
} from "./run-aggregator.js";
import type { SimulationRunState } from "./run-state.js";
import type { OutcomeCounts } from "./run-counters.js";
import { sleep } from "../utils.js";

/**
 * Drive the aggregator against a fake pool: `publish` stands in for the
 * scheduler's enqueues and `settle` for a worker INCRing a counter, so a test
 * can put the run into any lag state without a queue or a database.
 */
function harness(over: Partial<AggregatorDeps> = {}, options: AggregatorOptions = {}) {
  const counts: OutcomeCounts = { delivered: 0, skipped: 0, failed: 0 };
  let enqueued = 0;
  const writes: SimulationRunState[] = [];
  const logs: string[] = [];

  const agg = new RunStateAggregator(
    "s1",
    { pid: 42, startedAt: "t0", total: 10 },
    {
      now: () => Date.now(),
      sleep,
      readCounts: () => ({ ...counts }),
      enqueued: () => enqueued,
      write: async (_id, state) => { writes.push(state); },
      log: (message) => logs.push(message),
      ...over,
    },
    { flushIntervalMs: 1000, ...options },
  );

  return {
    agg,
    writes,
    logs,
    publish: (n: number) => { enqueued += n; },
    settle: (outcome: keyof OutcomeCounts, n = 1) => { counts[outcome] += n; },
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("RunStateAggregator", () => {
  it("flushes the pool's counters to the run row on the timer", async () => {
    const h = harness();
    h.publish(4);
    h.settle("delivered", 3);

    h.agg.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toMatchObject({
      pid: 42, status: "running", startedAt: "t0",
      delivered: 3, skipped: 0, failed: 0, total: 10,
    });
    expect(h.writes[0].completedAt).toBeUndefined();

    h.settle("failed");
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.writes).toHaveLength(2);
    expect(h.writes[1]).toMatchObject({ status: "running", delivered: 3, failed: 1 });

    await h.agg.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.writes).toHaveLength(2); // stopped means stopped
  });

  it("reports queue depth as inFlight, with its high-water mark as the peak", async () => {
    const h = harness();
    h.publish(30);
    expect(await h.agg.snapshot()).toMatchObject({ inFlight: 30, peakConcurrency: 30, total: 10 });

    h.settle("delivered", 25);
    expect(await h.agg.snapshot()).toMatchObject({ inFlight: 5, peakConcurrency: 30 });
  });

  it("clamps depth at zero when a worker settles between the two reads", async () => {
    // enqueued() and readCounts() are not one atomic read, so the settled count
    // can legitimately run ahead of the published count for an instant.
    const h = harness();
    h.publish(2);
    h.settle("delivered", 5);
    expect((await h.agg.snapshot()).inFlight).toBe(0);
  });

  it("logs the lag once when depth crosses the threshold, and once on recovery", async () => {
    const h = harness({}, { queueDepthWarn: 100 });
    h.publish(120);

    await h.agg.flush();
    await h.agg.flush();
    const warnings = h.logs.filter((l) => l.includes("worker pool is behind"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("not pausing the schedule");

    // Still above half the threshold: no recovery claimed yet, no new warning.
    h.settle("delivered", 40);
    await h.agg.flush();
    expect(h.logs).toHaveLength(1);

    h.settle("delivered", 60);
    await h.agg.flush();
    expect(h.logs[1]).toContain("caught up");
  });

  it("keeps flushing while lagging rather than pausing for the pool", async () => {
    const h = harness({}, { queueDepthWarn: 10 });
    h.publish(5000);
    h.agg.start();

    await vi.advanceTimersByTimeAsync(3000);
    expect(h.writes).toHaveLength(3);
    await h.agg.stop();
  });

  it("writes the terminal state once the queue drains", async () => {
    const h = harness();
    h.agg.start();
    h.publish(3);

    const finished = h.agg.finish("completed");
    await vi.advanceTimersByTimeAsync(250);
    // Still outstanding: the counts aren't final, so nothing terminal yet.
    expect(h.writes.every((w) => w.status === "running")).toBe(true);

    h.settle("delivered", 2);
    h.settle("skipped", 1);
    await vi.advanceTimersByTimeAsync(250);

    expect(await finished).toMatchObject({ inFlight: 0, delivered: 2, skipped: 1 });
    const terminal = h.writes[h.writes.length - 1];
    expect(terminal).toMatchObject({
      status: "completed", delivered: 2, skipped: 1, failed: 0, total: 10,
    });
    expect(terminal.completedAt).toBeTruthy();
    expect(h.writes.filter((w) => w.status !== "running")).toHaveLength(1);
  });

  it("gives up on a queue that never drains and still writes the terminal state", async () => {
    const h = harness({}, { drainTimeoutMs: 500 });
    h.publish(2);

    const finished = h.agg.finish("stopped");
    await vi.advanceTimersByTimeAsync(2000);
    await finished;

    expect(h.writes[h.writes.length - 1]).toMatchObject({ status: "stopped", delivered: 0 });
    expect(h.logs.some((l) => l.includes("still holding 2 job(s)"))).toBe(true);
  });

  it("skips the drain wait when asked, for a run with nothing outstanding", async () => {
    const h = harness({}, { drainTimeoutMs: 60_000 });
    h.publish(9); // never settled — a crashed run

    // No timer advance: with drain: false this must not wait on the queue.
    expect(await h.agg.finish("failed", { error: "boom", drain: false })).toMatchObject({
      inFlight: 9,
    });
    expect(h.writes[0]).toMatchObject({ status: "failed", error: "boom", total: 10 });
  });

  it("keeps flushing after a write fails", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    let fail = true;
    const written: SimulationRunState[] = [];
    const h = harness({
      write: async (_id, state) => {
        if (fail) throw new Error("SQLITE_BUSY");
        written.push(state);
      },
    });

    h.agg.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(written).toHaveLength(0);

    fail = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(written).toHaveLength(1);

    await h.agg.stop();
    stderr.mockRestore();
  });

  it("never lets the terminal write land before an in-flight flush", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const order: string[] = [];
    const h = harness({
      write: async (_id, state) => {
        if (state.status === "running") await gate;
        order.push(state.status);
      },
    });

    const periodic = h.agg.flush("running");
    const terminal = h.agg.finish("completed", { drain: false });
    release();
    await Promise.all([periodic, terminal]);

    expect(order).toEqual(["running", "completed"]);
  });
});
