import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile";
import type { SimulationRunState } from "./run-state";
import type { SimulationRecord } from "./store";

function running(): SimulationRecord {
  return {
    id: "s1", createdAt: "t0", updatedAt: "t0", status: "running",
    parameters: { clockSpeed: 60, durationSeconds: 120, usesExistingPopulation: true },
    startedAt: "t1",
  };
}
function runState(over: Partial<SimulationRunState>): SimulationRunState {
  return { pid: 1, status: "completed", startedAt: "t1", completedAt: "t2", delivered: 2, skipped: 1, failed: 0, total: 3, ...over };
}

describe("reconcile", () => {
  it("leaves a running record unchanged when run-state is missing", () => {
    expect(reconcile(running(), null)).toEqual(running());
  });

  it("leaves a running record unchanged while the worker is still running", () => {
    expect(reconcile(running(), runState({ status: "running" }))).toEqual(running());
  });

  it("marks completed with stats and completedAt", () => {
    const out = reconcile(running(), runState({ status: "completed" }));
    expect(out.status).toBe("completed");
    expect(out.completedAt).toBe("t2");
    expect(out.stats).toEqual({ delivered: 2, skipped: 1, failed: 0, total: 3 });
  });

  it("marks stopped with stats and stoppedAt", () => {
    const out = reconcile(running(), runState({ status: "stopped" }));
    expect(out.status).toBe("stopped");
    expect(out.stoppedAt).toBe("t2");
    expect(out.stats).toEqual({ delivered: 2, skipped: 1, failed: 0, total: 3 });
  });

  it("marks failed with the error surfaced in stats", () => {
    const out = reconcile(running(), runState({ status: "failed", error: "boom", delivered: 0, skipped: 0, failed: 0, total: 0 }));
    expect(out.status).toBe("failed");
    expect(out.completedAt).toBe("t2");
    expect(out.stats).toMatchObject({ error: "boom" });
  });

  it("ignores run-state for records that are not running", () => {
    const created: SimulationRecord = { ...running(), status: "created", startedAt: undefined };
    expect(reconcile(created, runState({ status: "completed" }))).toEqual(created);
  });
});
