import raw from "./config.json";

export interface GeneratorConfig {
  nationalId: { dailyProbPerCitizen: number };
  death: { dailyRatePerPopulation: number; stepDelaySeconds: number };
  birth: { dailyRatePerPopulation: number };
  marriage: { dailyRatePerPopulation: number };
  benefits: {
    dailyRatePerPopulation: number;
    chainProbabilities: { toStep2: number; toStep3: number };
    stepDelaySeconds: number;
  };
}

const DEFAULTS: GeneratorConfig = {
  nationalId: { dailyProbPerCitizen: 0.02 },
  death: { dailyRatePerPopulation: 0.000001, stepDelaySeconds: 300 },
  birth: { dailyRatePerPopulation: 0.00005 },
  marriage: { dailyRatePerPopulation: 0.0000015 },
  benefits: {
    dailyRatePerPopulation: 0.00001,
    chainProbabilities: { toStep2: 0.7, toStep3: 0.5 },
    stepDelaySeconds: 300,
  },
};

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Merge a config source over the built-in defaults so a missing or malformed
 * field never crashes generation. Defaults to the JSON asset.
 */
export function loadConfig(source: unknown = raw): GeneratorConfig {
  const c = (source ?? {}) as Record<string, any>;
  return {
    nationalId: {
      dailyProbPerCitizen: num(c.nationalId?.dailyProbPerCitizen, DEFAULTS.nationalId.dailyProbPerCitizen),
    },
    death: {
      dailyRatePerPopulation: num(c.death?.dailyRatePerPopulation, DEFAULTS.death.dailyRatePerPopulation),
      stepDelaySeconds: num(c.death?.stepDelaySeconds, DEFAULTS.death.stepDelaySeconds),
    },
    birth: {
      dailyRatePerPopulation: num(c.birth?.dailyRatePerPopulation, DEFAULTS.birth.dailyRatePerPopulation),
    },
    marriage: {
      dailyRatePerPopulation: num(c.marriage?.dailyRatePerPopulation, DEFAULTS.marriage.dailyRatePerPopulation),
    },
    benefits: {
      dailyRatePerPopulation: num(c.benefits?.dailyRatePerPopulation, DEFAULTS.benefits.dailyRatePerPopulation),
      chainProbabilities: {
        toStep2: num(c.benefits?.chainProbabilities?.toStep2, DEFAULTS.benefits.chainProbabilities.toStep2),
        toStep3: num(c.benefits?.chainProbabilities?.toStep3, DEFAULTS.benefits.chainProbabilities.toStep3),
      },
      stepDelaySeconds: num(c.benefits?.stepDelaySeconds, DEFAULTS.benefits.stepDelaySeconds),
    },
  };
}

/** Singleton loaded from the JSON asset, imported by generators. */
export const GENERATOR_CONFIG: GeneratorConfig = loadConfig();
