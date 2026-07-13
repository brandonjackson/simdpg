import { describe, it, expect } from "vitest";
import {
  loadConfig,
  GENERATOR_CONFIG,
  GENERATOR_CONFIG_FIELDS,
  getConfigValue,
  setConfigValue,
} from "./config";

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

describe("GENERATOR_CONFIG_FIELDS registry", () => {
  it("covers every leaf field of GeneratorConfig", () => {
    const paths = GENERATOR_CONFIG_FIELDS.map((f) => f.path.join("."));
    expect(new Set(paths)).toEqual(
      new Set([
        "nationalId.dailyProbPerCitizen",
        "death.dailyRatePerPopulation",
        "death.stepDelaySeconds",
        "birth.dailyRatePerPopulation",
        "marriage.dailyRatePerPopulation",
        "benefits.dailyRatePerPopulation",
        "benefits.chainProbabilities.toStep2",
        "benefits.chainProbabilities.toStep3",
        "benefits.stepDelaySeconds",
      ]),
    );
  });

  it("marks the two stepDelaySeconds fields non-editable and the rest editable", () => {
    for (const f of GENERATOR_CONFIG_FIELDS) {
      const expected = !f.path.includes("stepDelaySeconds");
      expect(f.editable).toBe(expected);
    }
  });

  it("getConfigValue reads a nested field by path", () => {
    const c = loadConfig({});
    expect(getConfigValue(c, ["benefits", "chainProbabilities", "toStep2"])).toBe(0.7);
  });

  it("setConfigValue returns a new config with only that field changed", () => {
    const c = loadConfig({});
    const next = setConfigValue(c, ["benefits", "chainProbabilities", "toStep2"], 0.9);
    expect(next.benefits.chainProbabilities.toStep2).toBe(0.9);
    expect(c.benefits.chainProbabilities.toStep2).toBe(0.7); // original untouched
    expect(next.death.dailyRatePerPopulation).toBe(c.death.dailyRatePerPopulation);
  });
});
