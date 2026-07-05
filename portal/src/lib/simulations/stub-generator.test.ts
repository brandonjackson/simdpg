import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("@/lib/form-webhooks", () => ({
  resolveFormWebhook: vi.fn(async (key: string) =>
    key === "national-id" ? { url: "http://hook/national-id", source: "registry" } : null,
  ),
}));

import { generateStubEvents } from "./stub-generator";
import { eventsFilePath } from "./paths";
import type { SimulationEvent } from "./events";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sim-stub-"));
  process.env.SIM_DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.SIM_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("generateStubEvents", () => {
  it("writes 3 national-id events with resolved URLs, 5s apart", async () => {
    const events = await generateStubEvents("s1");
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.scheduledMicros)).toEqual([0, 5_000_000, 10_000_000]);
    expect(events.every((e) => e.targetKey === "national-id")).toBe(true);
    expect(events.every((e) => e.targetUrl === "http://hook/national-id")).toBe(true);

    const raw = await fs.readFile(eventsFilePath("s1"), "utf8");
    const onDisk = JSON.parse(raw) as SimulationEvent[];
    expect(onDisk).toEqual(events);
  });

  it("stores null targetUrl when no webhook is registered", async () => {
    const { resolveFormWebhook } = await import("@/lib/form-webhooks");
    (resolveFormWebhook as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const events = await generateStubEvents("s2");
    expect(events.every((e) => e.targetUrl === null)).toBe(true);
  });
});
