import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { runWorker } from "./worker.js";
import { eventsFilePath, runStateFilePath } from "./paths.js";
import type { SimulationEvent } from "./events.js";
import type { SimulationRunState } from "./run-state.js";

let dir: string;

async function writeEvents(id: string, events: SimulationEvent[]): Promise<void> {
  await fs.mkdir(path.join(dir, ".simulations"), { recursive: true });
  await fs.writeFile(eventsFilePath(id), JSON.stringify(events));
}
async function readRunState(id: string): Promise<SimulationRunState> {
  return JSON.parse(await fs.readFile(runStateFilePath(id), "utf8"));
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sim-worker-"));
  process.env.SIM_DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.SIM_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("runWorker", () => {
  it("delivers events to a live webhook and writes completed run-state", async () => {
    const received: unknown[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => { received.push(JSON.parse(body)); res.writeHead(200).end(); });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;

    await writeEvents("s1", [
      { id: "e1", scheduledMicros: 0, targetKey: "national-id", targetUrl: url, payload: { n: 1 } },
      { id: "e2", scheduledMicros: 0, targetKey: "national-id", targetUrl: null, payload: { n: 2 } },
    ]);

    await runWorker("s1");
    await new Promise<void>((r) => server.close(() => r()));

    expect(received).toEqual([{ n: 1 }]);
    const state = await readRunState("s1");
    expect(state.status).toBe("completed");
    expect(state).toMatchObject({ delivered: 1, skipped: 1, failed: 0, total: 2 });
    expect(state.completedAt).toBeTruthy();
  });

  it("writes failed run-state when the events file is missing", async () => {
    await runWorker("missing");
    const state = await readRunState("missing");
    expect(state.status).toBe("failed");
    expect(state.error).toBeTruthy();
  });
});
