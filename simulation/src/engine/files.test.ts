import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eventsFilePath, simDbPath } from "./paths.js";
import { readEvents } from "./events.js";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sim-engine-"));
  process.env.SIM_DATA_DIR = dir;
  delete process.env.PORTAL_DB_FILE;
});
afterEach(async () => {
  delete process.env.SIM_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("paths", () => {
  it("resolves the events file under .simulations in SIM_DATA_DIR", () => {
    expect(eventsFilePath("abc")).toBe(path.join(dir, ".simulations", "abc.events.json"));
  });

  it("resolves the shared sqlite db under data/ in SIM_DATA_DIR", () => {
    expect(simDbPath()).toBe(path.join(dir, "data", "simulations.sqlite"));
  });

  it("honours PORTAL_DB_FILE as an explicit override", () => {
    process.env.PORTAL_DB_FILE = "/mnt/vol/portal.sqlite";
    expect(simDbPath()).toBe("/mnt/vol/portal.sqlite");
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
