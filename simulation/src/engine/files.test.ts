import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eventsFilePath, runStateFilePath } from "./paths.js";
import { readEvents } from "./events.js";
import { writeRunState, type SimulationRunState } from "./run-state.js";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sim-engine-"));
  process.env.SIM_DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.SIM_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("paths", () => {
  it("resolves event/run-state files under .simulations in SIM_DATA_DIR", () => {
    expect(eventsFilePath("abc")).toBe(path.join(dir, ".simulations", "abc.events.json"));
    expect(runStateFilePath("abc")).toBe(path.join(dir, ".simulations", "abc.run.json"));
  });
});

describe("readEvents", () => {
  it("reads a written events array", async () => {
    await fs.mkdir(path.join(dir, ".simulations"), { recursive: true });
    await fs.writeFile(
      eventsFilePath("abc"),
      JSON.stringify([{ id: "e1", scheduledMicros: 0, targetKey: "national-id", targetUrl: null, payload: {} }]),
    );
    const events = await readEvents("abc");
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("e1");
  });

  it("throws when the events file is missing", async () => {
    await expect(readEvents("missing")).rejects.toThrow();
  });
});

describe("writeRunState", () => {
  it("creates the directory and writes run state", async () => {
    const state: SimulationRunState = {
      pid: 123, status: "running", startedAt: "2026-07-04T00:00:00.000Z",
      delivered: 0, skipped: 0, failed: 0, total: 3,
    };
    await writeRunState("abc", state);
    const raw = await fs.readFile(runStateFilePath("abc"), "utf8");
    expect(JSON.parse(raw)).toEqual(state);
  });
});
