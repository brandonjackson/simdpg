/**
 * Population generation configuration.
 *
 * This shape is what the staff page edits, what gets exported / imported as
 * JSON, and what the generator consumes. It is intentionally free of any
 * Node-only imports so it can be shared by both the client page and the
 * server-side API routes.
 */

import { ETHNIC_GROUPS, type EthnicGroup } from "./names";

export type AgeDistribution = "young" | "balanced" | "ageing";

export interface PopulationConfig {
  /** Target number of citizens. */
  size: number;
  /** Shape of the population age pyramid. */
  ageDistribution: AgeDistribution;
  /** How many cities the population is spread across (1 = single city). */
  geographicSpread: number;
  /** Children per household, inclusive range. */
  householdChildren: { min: number; max: number };
  /** Cultural groups names are drawn from (the "ethnicity / language mix"). */
  ethnicityMix: EthnicGroup[];
  /** Fraction (0–1) of citizens given a pre-existing chronic condition. */
  preExistingConditionRate: number;
  /** Fraction (0–1) of eligible adults enrolled in a benefit programme. */
  benefitEligibilityRate: number;
}

export const DEFAULT_CONFIG: PopulationConfig = {
  size: 100,
  ageDistribution: "balanced",
  geographicSpread: 5,
  householdChildren: { min: 0, max: 4 },
  ethnicityMix: [...ETHNIC_GROUPS],
  preExistingConditionRate: 0.15,
  benefitEligibilityRate: 0.3,
};

/** Age-bucket weights for each distribution preset. Buckets are fixed. */
export const AGE_BUCKETS: { min: number; max: number }[] = [
  { min: 0, max: 4 },
  { min: 5, max: 14 },
  { min: 15, max: 24 },
  { min: 25, max: 34 },
  { min: 35, max: 44 },
  { min: 45, max: 54 },
  { min: 55, max: 64 },
  { min: 65, max: 74 },
  { min: 75, max: 90 },
];

export const AGE_WEIGHTS: Record<AgeDistribution, number[]> = {
  // Skewed towards children and young adults.
  young: [16, 22, 19, 15, 11, 7, 5, 3, 2],
  // The current default pyramid.
  balanced: [12, 18, 17, 15, 13, 10, 8, 5, 2],
  // Skewed towards older cohorts.
  ageing: [6, 9, 11, 12, 13, 14, 13, 12, 10],
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Coerce arbitrary (e.g. imported JSON) input into a valid PopulationConfig,
 * falling back to defaults for anything missing or out of range.
 */
export function normalizeConfig(input: unknown): PopulationConfig {
  const raw = (input ?? {}) as Partial<PopulationConfig>;

  const ageDistribution: AgeDistribution =
    raw.ageDistribution === "young" ||
    raw.ageDistribution === "ageing" ||
    raw.ageDistribution === "balanced"
      ? raw.ageDistribution
      : DEFAULT_CONFIG.ageDistribution;

  const mix = Array.isArray(raw.ethnicityMix)
    ? raw.ethnicityMix.filter((g): g is EthnicGroup =>
        ETHNIC_GROUPS.includes(g as EthnicGroup),
      )
    : [];

  let minChildren = clampNumber(raw.householdChildren?.min, 0, 10, DEFAULT_CONFIG.householdChildren.min);
  let maxChildren = clampNumber(raw.householdChildren?.max, 0, 10, DEFAULT_CONFIG.householdChildren.max);
  if (minChildren > maxChildren) [minChildren, maxChildren] = [maxChildren, minChildren];

  return {
    size: Math.round(clampNumber(raw.size, 1, 1_000_000, DEFAULT_CONFIG.size)),
    ageDistribution,
    geographicSpread: Math.round(clampNumber(raw.geographicSpread, 1, 12, DEFAULT_CONFIG.geographicSpread)),
    householdChildren: { min: Math.round(minChildren), max: Math.round(maxChildren) },
    ethnicityMix: mix.length > 0 ? mix : [...DEFAULT_CONFIG.ethnicityMix],
    preExistingConditionRate: clampNumber(raw.preExistingConditionRate, 0, 1, DEFAULT_CONFIG.preExistingConditionRate),
    benefitEligibilityRate: clampNumber(raw.benefitEligibilityRate, 0, 1, DEFAULT_CONFIG.benefitEligibilityRate),
  };
}

/** A short human-readable summary of a config, for the run log. */
export function summarizeConfig(c: PopulationConfig): string {
  return [
    `${c.size} citizens`,
    `${c.ageDistribution} ages`,
    `${c.geographicSpread} cities`,
    `${c.householdChildren.min}-${c.householdChildren.max} children`,
    `${c.ethnicityMix.length} groups`,
    `${Math.round(c.preExistingConditionRate * 100)}% conditions`,
    `${Math.round(c.benefitEligibilityRate * 100)}% benefits`,
  ].join(", ");
}
