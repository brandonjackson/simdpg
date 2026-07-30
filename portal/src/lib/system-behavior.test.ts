import { describe, it, expect, vi, afterEach } from "vitest";
import { behaviorPreset, BEHAVIOR_OFF } from "@simdpg/system-kit/behavior";
import {
  BEHAVIOR_TARGETS,
  applySystemBehavior,
  clearSystemBehavior,
  enabledSystems,
  readSystemBehavior,
  type SystemBehaviorResult,
  type SystemTarget,
} from "./system-behavior";

const TARGETS: SystemTarget[] = [
  { id: "identity", label: "Identity", url: "http://identity.test" },
  { id: "health", label: "Health", url: "http://health.test" },
];

function stateFor(system: string, enabled: boolean) {
  return {
    system,
    enabled,
    config: enabled ? behaviorPreset("flaky")!.config : BEHAVIOR_OFF,
    preset: enabled ? "flaky" : "off",
    source: null,
    applied_at: null,
    expires_at: null,
    counters: {
      requests: 0,
      delayed: 0,
      delay_ms_total: 0,
      injected_errors: 0,
      rate_limited: 0,
    },
  };
}

function stubFetch(
  handler: (url: string, init: RequestInit) => unknown,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => handler(url, init),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BEHAVIOR_TARGETS", () => {
  it("covers all seven systems", () => {
    expect(BEHAVIOR_TARGETS).toHaveLength(7);
    expect(BEHAVIOR_TARGETS.map((t) => t.id)).toEqual([
      "identity",
      "civil-registry",
      "health",
      "benefits",
      "notifications",
      "payments",
      "social-registry",
    ]);
    for (const target of BEHAVIOR_TARGETS) {
      expect(target.url, target.id).toMatch(/^https?:\/\//);
    }
  });
});

describe("applySystemBehavior", () => {
  it("PUTs the same config to every target with its source and expiry", async () => {
    const fetchMock = stubFetch((url) => stateFor(url, true));
    const config = behaviorPreset("flaky")!.config;

    const results = await applySystemBehavior(
      config,
      { source: "simulation abc12345", expiresAt: "2026-07-30T12:00:00.000Z" },
      TARGETS,
    );

    expect(results.every((r) => r.ok)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      "http://identity.test/admin/behavior",
      "http://health.test/admin/behavior",
    ]);

    for (const [, init] of fetchMock.mock.calls) {
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body as string)).toEqual({
        ...config,
        source: "simulation abc12345",
        expires_at: "2026-07-30T12:00:00.000Z",
      });
    }
  });

  it("reports a failing system without failing the others", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("http://health.test")) throw new Error("ECONNREFUSED");
      return { ok: true, status: 200, json: async () => stateFor("identity", true) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await applySystemBehavior(BEHAVIOR_OFF, {}, TARGETS);

    expect(results[0]).toMatchObject({ id: "identity", ok: true });
    expect(results[1]).toMatchObject({ id: "health", ok: false, error: "ECONNREFUSED" });
  });

  it("treats a non-2xx reply as a failure for that system", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );

    const results = await applySystemBehavior(BEHAVIOR_OFF, {}, TARGETS);

    expect(results.map((r) => r.ok)).toEqual([false, false]);
    expect(results[0].error).toBe("status 500");
  });
});

describe("clearSystemBehavior", () => {
  it("DELETEs on every target", async () => {
    const fetchMock = stubFetch((url) => stateFor(url, false));

    const results = await clearSystemBehavior(TARGETS);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual([
      "DELETE",
      "DELETE",
    ]);
  });
});

describe("readSystemBehavior", () => {
  it("GETs each system's state", async () => {
    const fetchMock = stubFetch((url) =>
      stateFor(url, url.startsWith("http://identity.test")),
    );

    const results = await readSystemBehavior(TARGETS);

    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual(["GET", "GET"]);
    expect(results[0].state?.enabled).toBe(true);
    expect(results[1].state?.enabled).toBe(false);
  });
});

describe("enabledSystems", () => {
  it("picks out only the systems reporting behaviour in force", () => {
    const results: SystemBehaviorResult[] = [
      { id: "identity", label: "Identity", ok: true, state: stateFor("identity", true) },
      { id: "health", label: "Health", ok: true, state: stateFor("health", false) },
      { id: "payments", label: "Payments", ok: false, error: "down" },
    ];

    expect(enabledSystems(results).map((r) => r.id)).toEqual(["identity"]);
  });
});
