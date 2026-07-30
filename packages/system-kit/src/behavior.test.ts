import { describe, it, expect } from "vitest";
import {
  BEHAVIOR_FIELDS,
  BEHAVIOR_OFF,
  BEHAVIOR_PRESETS,
  behaviorPreset,
  behaviorPresetLabel,
  describeBehavior,
  getBehaviorValue,
  hasLatency,
  isBehaviorOff,
  matchBehaviorPreset,
  parseBehavior,
  sampleLatencyMs,
  setBehaviorValue,
} from "./behavior.js";

describe("BEHAVIOR_OFF", () => {
  it("is the mocker's all-off default", () => {
    expect(BEHAVIOR_OFF).toEqual({
      latency: { mean_ms: 0, stddev_ms: 0, min_ms: 0, max_ms: null },
      error_rate: 0,
      error_status: 500,
      rate_limit: { max: 0, window_ms: 1000, status: 429 },
    });
    expect(isBehaviorOff(BEHAVIOR_OFF)).toBe(true);
  });

  it("matches every field descriptor's default", () => {
    for (const field of BEHAVIOR_FIELDS) {
      expect(getBehaviorValue(BEHAVIOR_OFF, field.path)).toBe(field.default);
    }
  });
});

describe("parseBehavior", () => {
  it("falls back to off for a missing or malformed source", () => {
    expect(parseBehavior(undefined)).toEqual(BEHAVIOR_OFF);
    expect(parseBehavior(null)).toEqual(BEHAVIOR_OFF);
    expect(parseBehavior("nonsense")).toEqual(BEHAVIOR_OFF);
    expect(parseBehavior({ latency: "nope", error_rate: "high" })).toEqual(BEHAVIOR_OFF);
  });

  it("accepts a mocker-shaped config verbatim", () => {
    const config = parseBehavior({
      latency: { mean_ms: 200, stddev_ms: 60, min_ms: 20, max_ms: 1500 },
      error_rate: 0.02,
      error_status: 503,
      rate_limit: { max: 20, window_ms: 1000, status: 429 },
    });

    expect(config).toEqual({
      latency: { mean_ms: 200, stddev_ms: 60, min_ms: 20, max_ms: 1500 },
      error_rate: 0.02,
      error_status: 503,
      rate_limit: { max: 20, window_ms: 1000, status: 429 },
    });
  });

  it("merges nested maps key-by-key over the base", () => {
    const base = parseBehavior({
      latency: { mean_ms: 200, stddev_ms: 60, min_ms: 20, max_ms: 1500 },
      rate_limit: { max: 20, window_ms: 1000, status: 429 },
    });

    const config = parseBehavior({ latency: { mean_ms: 400 } }, base);

    expect(config.latency).toEqual({
      mean_ms: 400,
      stddev_ms: 60,
      min_ms: 20,
      max_ms: 1500,
    });
    expect(config.rate_limit.max).toBe(20);
  });

  it("clamps out-of-range values instead of rejecting them", () => {
    const config = parseBehavior({
      latency: { mean_ms: -100, stddev_ms: 12.6 },
      error_rate: 2,
      error_status: 200,
      rate_limit: { max: -5, window_ms: 0, status: 999 },
    });

    expect(config.latency.mean_ms).toBe(0);
    expect(config.latency.stddev_ms).toBe(13);
    expect(config.error_rate).toBe(1);
    expect(config.error_status).toBe(400);
    expect(config.rate_limit.max).toBe(0);
    expect(config.rate_limit.window_ms).toBe(1);
    expect(config.rate_limit.status).toBe(599);
  });

  it("treats null as 'no cap' for max_ms and 'unset' elsewhere", () => {
    const base = parseBehavior({ latency: { mean_ms: 200, max_ms: 900 } });

    expect(parseBehavior({ latency: { max_ms: null } }, base).latency.max_ms).toBeNull();
    expect(parseBehavior({ latency: { mean_ms: null } }, base).latency.mean_ms).toBe(200);
  });

  it("raises a max below the min so the clamp can't invert", () => {
    const config = parseBehavior({ latency: { min_ms: 500, max_ms: 100 } });
    expect(config.latency.max_ms).toBe(500);
  });
});

describe("isBehaviorOff", () => {
  it("is false when any of the three levers is engaged", () => {
    expect(isBehaviorOff(parseBehavior({ latency: { mean_ms: 1 } }))).toBe(false);
    expect(isBehaviorOff(parseBehavior({ latency: { min_ms: 5 } }))).toBe(false);
    expect(isBehaviorOff(parseBehavior({ error_rate: 0.01 }))).toBe(false);
    expect(isBehaviorOff(parseBehavior({ rate_limit: { max: 1 } }))).toBe(false);
  });

  it("ignores statuses and window length on their own", () => {
    const config = parseBehavior({
      error_status: 503,
      rate_limit: { window_ms: 5000, status: 503 },
    });
    expect(isBehaviorOff(config)).toBe(true);
  });
});

describe("presets", () => {
  it("starts with off, which is the default config", () => {
    expect(BEHAVIOR_PRESETS[0].id).toBe("off");
    expect(BEHAVIOR_PRESETS[0].config).toEqual(BEHAVIOR_OFF);
  });

  it("has a unique id and an enabled config for every non-off preset", () => {
    const ids = BEHAVIOR_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const preset of BEHAVIOR_PRESETS.filter((p) => p.id !== "off")) {
      expect(isBehaviorOff(preset.config), preset.id).toBe(false);
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });

  it("throttles deterministically in the rate-limited preset", () => {
    const config = behaviorPreset("rate-limited")!.config;
    expect(config.rate_limit).toEqual({ max: 20, window_ms: 1000, status: 429 });
    expect(config.error_rate).toBe(0);
  });

  it("round-trips a preset config back to its id", () => {
    for (const preset of BEHAVIOR_PRESETS) {
      expect(matchBehaviorPreset(preset.config)?.id).toBe(preset.id);
      expect(behaviorPresetLabel(preset.config)).toBe(preset.name);
    }
  });

  it("labels a hand-edited config as custom", () => {
    const edited = setBehaviorValue(
      behaviorPreset("flaky")!.config,
      ["error_rate"],
      0.42,
    );
    expect(matchBehaviorPreset(edited)).toBeNull();
    expect(behaviorPresetLabel(edited)).toBe("Custom");
  });

  it("survives a JSON round-trip (it is stored in a simulation record)", () => {
    for (const preset of BEHAVIOR_PRESETS) {
      const restored = parseBehavior(JSON.parse(JSON.stringify(preset.config)));
      expect(matchBehaviorPreset(restored)?.id).toBe(preset.id);
    }
  });
});

describe("describeBehavior", () => {
  it("says so when nothing is enabled", () => {
    expect(describeBehavior(BEHAVIOR_OFF)).toMatch(/^Off/);
  });

  it("summarises latency, failures, and throttling", () => {
    const summary = describeBehavior(behaviorPreset("overloaded")!.config);
    expect(summary).toContain("2000 ms ± 800 ms latency");
    expect(summary).toContain("capped at 10000 ms");
    expect(summary).toContain("5% of requests fail with 503");
    expect(summary).toContain("10 requests per 1000 ms, then 429");
  });

  it("keeps sub-1% rates readable", () => {
    expect(describeBehavior(behaviorPreset("realistic")!.config)).toContain("0.5%");
  });

  it("omits the spread when the delay is fixed", () => {
    const summary = describeBehavior(parseBehavior({ latency: { mean_ms: 100 } }));
    expect(summary).toBe("100 ms latency");
  });
});

describe("sampleLatencyMs", () => {
  it("returns 0 when latency is not configured", () => {
    expect(sampleLatencyMs(BEHAVIOR_OFF.latency)).toBe(0);
    expect(hasLatency(BEHAVIOR_OFF.latency)).toBe(false);
  });

  it("returns exactly the mean when the deviation is 0", () => {
    const { latency } = parseBehavior({ latency: { mean_ms: 250 } });
    expect(sampleLatencyMs(latency, () => 0.5)).toBe(250);
  });

  it("varies around the mean with a normal distribution", () => {
    const { latency } = parseBehavior({ latency: { mean_ms: 200, stddev_ms: 50 } });
    const samples = Array.from({ length: 400 }, () => sampleLatencyMs(latency));
    const mean = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;

    expect(mean).toBeGreaterThan(160);
    expect(mean).toBeLessThan(240);
    expect(new Set(samples).size).toBeGreaterThan(50);
  });

  it("clamps into [min_ms, max_ms]", () => {
    const { latency } = parseBehavior({
      latency: { mean_ms: 500, stddev_ms: 5000, min_ms: 100, max_ms: 900 },
    });

    for (let i = 0; i < 200; i++) {
      const ms = sampleLatencyMs(latency);
      expect(ms).toBeGreaterThanOrEqual(100);
      expect(ms).toBeLessThanOrEqual(900);
    }
  });

  it("never goes negative without a min", () => {
    const { latency } = parseBehavior({ latency: { mean_ms: 10, stddev_ms: 1000 } });
    for (let i = 0; i < 200; i++) {
      expect(sampleLatencyMs(latency)).toBeGreaterThanOrEqual(0);
    }
  });
});
