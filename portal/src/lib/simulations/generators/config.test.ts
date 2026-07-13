import { describe, it, expect } from "vitest";
import { loadConfig, GENERATOR_CONFIG } from "./config";

describe("loadConfig", () => {
  it("returns defaults when given an empty object", () => {
    const c = loadConfig({});
    expect(c.nationalId.dailyProbPerCitizen).toBe(0.02);
    expect(c.death.dailyRatePerPopulation).toBe(0.000001);
    expect(c.death.stepDelaySeconds).toBe(300);
    expect(c.birth.dailyRatePerPopulation).toBe(0.00005);
    expect(c.marriage.dailyRatePerPopulation).toBe(0.0000015);
    expect(c.benefits.dailyRatePerPopulation).toBe(0.00001);
    expect(c.benefits.chainProbabilities).toEqual({ toStep2: 0.7, toStep3: 0.5 });
    expect(c.benefits.stepDelaySeconds).toBe(300);
  });

  it("overrides only the provided fields, keeping defaults for the rest", () => {
    const c = loadConfig({ death: { dailyRatePerPopulation: 0.5 } });
    expect(c.death.dailyRatePerPopulation).toBe(0.5);
    expect(c.death.stepDelaySeconds).toBe(300); // still default
    expect(c.birth.dailyRatePerPopulation).toBe(0.00005); // untouched
  });

  it("ignores malformed (non-number) values and falls back", () => {
    const c = loadConfig({ nationalId: { dailyProbPerCitizen: "nope" } });
    expect(c.nationalId.dailyProbPerCitizen).toBe(0.02);
  });

  it("exposes a loaded singleton parsed from the JSON asset", () => {
    expect(typeof GENERATOR_CONFIG.death.dailyRatePerPopulation).toBe("number");
  });

  it("clamps a negative rate to 0", () => {
    const c = loadConfig({ death: { dailyRatePerPopulation: -5 } });
    expect(c.death.dailyRatePerPopulation).toBe(0);
  });

  it("clamps a toStep2 above 1 down to 1", () => {
    const c = loadConfig({ benefits: { chainProbabilities: { toStep2: 1.5 } } });
    expect(c.benefits.chainProbabilities.toStep2).toBe(1);
  });

  it("clamps a negative toStep3 up to 0", () => {
    const c = loadConfig({ benefits: { chainProbabilities: { toStep3: -0.2 } } });
    expect(c.benefits.chainProbabilities.toStep3).toBe(0);
  });
});
