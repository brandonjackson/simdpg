import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { summarizeEvents, getEventSummary } from "./event-summary";
import { writeEvents, type SimulationEvent } from "./events";

function event(over: Partial<SimulationEvent> = {}): SimulationEvent {
  return {
    id: "e1",
    scheduledMicros: 0,
    targetKey: "national-id",
    targetUrl: "http://hook/national-id",
    payload: {},
    ...over,
  };
}

describe("summarizeEvents", () => {
  it("returns an empty summary for no events", () => {
    expect(summarizeEvents([])).toEqual({
      total: 0,
      byType: [],
      unresolved: 0,
      firstScheduledMicros: null,
      lastScheduledMicros: null,
    });
  });

  it("groups by target key and labels via the form-hook catalog", () => {
    const summary = summarizeEvents([
      event({ targetKey: "national-id" }),
      event({ targetKey: "national-id" }),
      event({ targetKey: "birth-registration", targetUrl: "http://hook/birth" }),
    ]);

    expect(summary.total).toBe(3);
    // Most frequent first.
    expect(summary.byType).toEqual([
      {
        targetKey: "national-id",
        label: "National ID application",
        count: 2,
        hasTarget: true,
      },
      {
        targetKey: "birth-registration",
        label: "Birth registration",
        count: 1,
        hasTarget: true,
      },
    ]);
  });

  it("falls back to the key when the target is not in the catalog", () => {
    const summary = summarizeEvents([event({ targetKey: "mystery-hook" })]);
    expect(summary.byType[0].label).toBe("mystery-hook");
  });

  it("counts unresolved events and flags their type", () => {
    const summary = summarizeEvents([
      event({ targetKey: "national-id", targetUrl: null }),
      event({ targetKey: "national-id", targetUrl: null }),
      event({ targetKey: "birth-registration", targetUrl: "http://hook/birth" }),
    ]);

    expect(summary.unresolved).toBe(2);
    const nationalId = summary.byType.find((t) => t.targetKey === "national-id");
    const birth = summary.byType.find((t) => t.targetKey === "birth-registration");
    expect(nationalId?.hasTarget).toBe(false);
    expect(birth?.hasTarget).toBe(true);
  });

  it("reports the first and last scheduled offsets", () => {
    const summary = summarizeEvents([
      event({ scheduledMicros: 5_000 }),
      event({ scheduledMicros: 1_000 }),
      event({ scheduledMicros: 9_000 }),
    ]);
    expect(summary.firstScheduledMicros).toBe(1_000);
    expect(summary.lastScheduledMicros).toBe(9_000);
  });
});

describe("getEventSummary", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "sim-summary-"));
    process.env.SIM_DATA_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.SIM_DATA_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns null when the simulation has not been generated", async () => {
    expect(await getEventSummary("missing")).toBeNull();
  });

  it("summarizes the persisted events file", async () => {
    await writeEvents("s1", [
      event({ targetKey: "national-id", scheduledMicros: 2_000 }),
      event({ targetKey: "national-id", targetUrl: null, scheduledMicros: 4_000 }),
    ]);

    const summary = await getEventSummary("s1");
    expect(summary).toMatchObject({
      total: 2,
      unresolved: 1,
      firstScheduledMicros: 2_000,
      lastScheduledMicros: 4_000,
    });
    expect(summary?.byType[0]).toMatchObject({
      targetKey: "national-id",
      count: 2,
      hasTarget: true, // one event still resolved a URL
    });
  });

  it("returns an empty summary for an empty events file", async () => {
    await writeEvents("s2", []);
    expect(await getEventSummary("s2")).toEqual({
      total: 0,
      byType: [],
      unresolved: 0,
      firstScheduledMicros: null,
      lastScheduledMicros: null,
    });
  });
});
