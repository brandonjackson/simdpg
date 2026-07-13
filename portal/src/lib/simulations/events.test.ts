import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeEvents, readEvents, type SimulationEvent } from "./events";

const EVENTS: SimulationEvent[] = [
  {
    id: "e1",
    scheduledMicros: 1000,
    targetKey: "marriage-registration",
    targetUrl: null,
    payload: { a: 1 },
  },
];

let dir: string;
const origSimDataDir = process.env.SIM_DATA_DIR;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sim-events-"));
  process.env.SIM_DATA_DIR = dir;
});

afterEach(async () => {
  if (origSimDataDir === undefined) delete process.env.SIM_DATA_DIR;
  else process.env.SIM_DATA_DIR = origSimDataDir;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("readEvents", () => {
  it("round-trips events written by writeEvents", async () => {
    await writeEvents("sim-1", EVENTS);
    expect(await readEvents("sim-1")).toEqual(EVENTS);
  });

  it("returns an empty array when no events file exists", async () => {
    expect(await readEvents("missing")).toEqual([]);
  });
});
