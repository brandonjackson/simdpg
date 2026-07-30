import { describe, it, expect, vi, afterEach } from "vitest";
import { BEHAVIOR_OFF, behaviorPreset } from "@simdpg/system-kit/behavior";
import {
  BEHAVIOR_EXPIRY_GRACE_MS,
  SYSTEM_BEHAVIOR_TARGETS,
  applyBehavior,
  behaviorExpiry,
  clearBehavior,
} from "./behavior.js";

const TARGETS = [
  { label: "identity", url: "http://identity.test" },
  { label: "health", url: "http://health.test" },
];

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SYSTEM_BEHAVIOR_TARGETS", () => {
  it("covers all seven systems", () => {
    expect(SYSTEM_BEHAVIOR_TARGETS).toHaveLength(7);
    for (const target of SYSTEM_BEHAVIOR_TARGETS) {
      expect(target.url, target.label).toMatch(/^https?:\/\//);
    }
  });
});

describe("behaviorExpiry", () => {
  it("covers the run's schedule plus a grace period", () => {
    const nowMs = Date.parse("2026-07-30T10:00:00.000Z");
    const expiry = behaviorExpiry(60_000, nowMs);

    expect(Date.parse(expiry)).toBe(nowMs + 60_000 + BEHAVIOR_EXPIRY_GRACE_MS);
  });

  it("still gives a future deadline for an empty schedule", () => {
    const nowMs = Date.parse("2026-07-30T10:00:00.000Z");
    expect(Date.parse(behaviorExpiry(0, nowMs))).toBeGreaterThan(nowMs);
    expect(Date.parse(behaviorExpiry(-5, nowMs))).toBe(nowMs + BEHAVIOR_EXPIRY_GRACE_MS);
  });
});

describe("applyBehavior", () => {
  it("PUTs the config, source, and expiry to every system", async () => {
    const fetchMock = stubFetch();
    const config = behaviorPreset("slow")!.config;

    const applied = await applyBehavior(
      config,
      { source: "simulation abc12345", expiresAt: "2026-07-30T11:00:00.000Z" },
      TARGETS,
    );

    expect(applied).toEqual(["identity", "health"]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://identity.test/admin/behavior",
      "http://health.test/admin/behavior",
    ]);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      ...config,
      source: "simulation abc12345",
      expires_at: "2026-07-30T11:00:00.000Z",
    });
  });

  it("skips a system it can't reach and keeps the rest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("http://health.test")) throw new Error("ECONNREFUSED");
        return { ok: true, status: 200 };
      }),
    );

    const applied = await applyBehavior(
      BEHAVIOR_OFF,
      { source: "test", expiresAt: "2026-07-30T11:00:00.000Z" },
      TARGETS,
    );

    expect(applied).toEqual(["identity"]);
  });

  it("treats a non-2xx reply as not applied", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));

    const applied = await applyBehavior(
      BEHAVIOR_OFF,
      { source: "test", expiresAt: "2026-07-30T11:00:00.000Z" },
      TARGETS,
    );

    expect(applied).toEqual([]);
  });
});

describe("clearBehavior", () => {
  it("DELETEs on every system", async () => {
    const fetchMock = stubFetch();

    const cleared = await clearBehavior(TARGETS);

    expect(cleared).toEqual(["identity", "health"]);
    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual([
      "DELETE",
      "DELETE",
    ]);
  });
});
