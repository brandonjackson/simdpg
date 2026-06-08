import type { assessments, vulnerabilityIndicators } from "./db/schema.js";

type Assessment = typeof assessments.$inferSelect;
type Indicator = typeof vulnerabilityIndicators.$inferSelect;

/**
 * Default relative weights per vulnerability indicator. Used when an
 * assessment is recorded without explicit weights, and as the basis for the
 * weighted vulnerability score that drives targeting.
 */
export const INDICATOR_WEIGHTS: Record<Indicator["indicator"], number> = {
  disability: 3,
  elderly: 2,
  single_parent: 2,
  chronic_illness: 2,
  unemployed: 1,
  dependents: 1,
};

export type IncomeBand = "low" | "medium" | "high";
export type TargetingBand = "priority" | "eligible" | "not_targeted";

/** Derive an income band from a PMT score (lower score = poorer). */
export function incomeBandFromPmt(pmt: number): IncomeBand {
  if (pmt <= 33) return "low";
  if (pmt <= 66) return "medium";
  return "high";
}

export interface TargetingProfile {
  household_id: string;
  has_assessment: boolean;
  assessment_id: string | null;
  head_citizen_id: string | null;
  pmt_score: number | null;
  income_band: IncomeBand | null;
  vulnerability_flags: Indicator["indicator"][];
  vulnerability_score: number;
  targeting_band: TargetingBand;
  /** True when the household should be targeted for assistance. */
  targeted: boolean;
  assessed_at: string | null;
  valid_until: string | null;
  status: Assessment["status"] | null;
  /** True when `valid_until` is in the past relative to `asOf`. */
  expired: boolean;
}

/**
 * Combine a household's active assessment and its vulnerability indicators
 * into the targeting profile that Benefits consumes. Targeting is driven by
 * assessed need: a low PMT score *or* a high weighted vulnerability score
 * pulls a household into the targeted population.
 */
export function computeTargeting(
  householdId: string,
  assessment: Assessment | undefined,
  indicators: Indicator[],
  asOf: Date = new Date(),
): TargetingProfile {
  if (!assessment) {
    return {
      household_id: householdId,
      has_assessment: false,
      assessment_id: null,
      head_citizen_id: null,
      pmt_score: null,
      income_band: null,
      vulnerability_flags: [],
      vulnerability_score: 0,
      targeting_band: "not_targeted",
      targeted: false,
      assessed_at: null,
      valid_until: null,
      status: null,
      expired: false,
    };
  }

  const vulnerability_score = indicators.reduce(
    (sum, ind) => sum + ind.weight,
    0,
  );
  const vulnerability_flags = indicators.map((ind) => ind.indicator);

  let targeting_band: TargetingBand = "not_targeted";
  if (assessment.pmt_score <= 25 || vulnerability_score >= 4) {
    targeting_band = "priority";
  } else if (assessment.pmt_score <= 45 || vulnerability_score >= 2) {
    targeting_band = "eligible";
  }

  const expired = new Date(assessment.valid_until).getTime() < asOf.getTime();
  // An expired assessment can still be reported, but it never targets.
  const targeted = targeting_band !== "not_targeted" && !expired;

  return {
    household_id: householdId,
    has_assessment: true,
    assessment_id: assessment.id,
    head_citizen_id: assessment.head_citizen_id,
    pmt_score: assessment.pmt_score,
    income_band: assessment.income_band,
    vulnerability_flags,
    vulnerability_score,
    targeting_band,
    targeted,
    assessed_at: assessment.assessed_at,
    valid_until: assessment.valid_until,
    status: assessment.status,
    expired,
  };
}
