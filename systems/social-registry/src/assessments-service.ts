import { v4 as uuidv4 } from "uuid";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/index.js";
import { assessments, vulnerabilityIndicators } from "./db/schema.js";
import { INDICATOR_WEIGHTS, incomeBandFromPmt } from "./targeting.js";

type Assessment = typeof assessments.$inferSelect;
type Indicator = typeof vulnerabilityIndicators.$inferSelect;

const INDICATOR_ENUM = [
  "disability",
  "elderly",
  "single_parent",
  "chronic_illness",
  "unemployed",
  "dependents",
] as const;

/** Shared shape of an inbound assessment (used by create + recertify). */
export const assessmentInputSchema = z.object({
  household_id: z.string().min(1),
  head_citizen_id: z.string().min(1),
  pmt_score: z.number().min(0).max(100),
  income_band: z.enum(["low", "medium", "high"]).optional(),
  data_source: z.enum(["interview", "imported", "recertified"]).optional(),
  assessed_at: z.string().datetime().optional(),
  valid_until: z.string().datetime().optional(),
  indicators: z
    .array(
      z.object({
        indicator: z.enum(INDICATOR_ENUM),
        value: z.number().positive().optional(),
        weight: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
});

export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

/** Default assessment validity, in months, before recertification is due. */
const VALIDITY_MONTHS = 12;

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/** Load the indicator rows for an assessment. */
export function getIndicators(assessmentId: string): Indicator[] {
  return db
    .select()
    .from(vulnerabilityIndicators)
    .where(eq(vulnerabilityIndicators.assessment_id, assessmentId))
    .all();
}

/** Most recent active assessment for a household, if any. */
export function getActiveAssessment(
  householdId: string,
): Assessment | undefined {
  return db
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.household_id, householdId),
        eq(assessments.status, "active"),
      ),
    )
    .orderBy(desc(assessments.assessed_at))
    .get();
}

export function getAssessmentById(id: string): Assessment | undefined {
  return db.select().from(assessments).where(eq(assessments.id, id)).get();
}

/** Shape an assessment row plus its indicators for an API response. */
export function formatAssessment(row: Assessment, indicators: Indicator[]) {
  return {
    ...row,
    indicators: indicators.map((ind) => ({
      id: ind.id,
      indicator: ind.indicator,
      value: ind.value,
      weight: ind.weight,
    })),
  };
}

export interface CreateOptions {
  /** When set, the active assessment for the household is superseded first. */
  supersedePrevious?: boolean;
  /** Forces the data_source (e.g. "recertified"). */
  dataSource?: Assessment["data_source"];
}

/**
 * Persist a new assessment and its vulnerability indicators. Optionally
 * supersedes the household's current active assessment (used by recertify).
 * Returns the formatted assessment plus the id of any superseded record.
 */
export function createAssessment(
  input: AssessmentInput,
  options: CreateOptions = {},
): {
  assessment: ReturnType<typeof formatAssessment>;
  supersededId: string | null;
} {
  const now = new Date().toISOString();
  const assessedAt = input.assessed_at ?? now;
  const validUntil = input.valid_until ?? addMonths(assessedAt, VALIDITY_MONTHS);
  const dataSource = options.dataSource ?? input.data_source ?? "interview";

  let supersededId: string | null = null;
  if (options.supersedePrevious) {
    const previous = getActiveAssessment(input.household_id);
    if (previous) {
      db.update(assessments)
        .set({ status: "superseded", updated_at: now })
        .where(eq(assessments.id, previous.id))
        .run();
      supersededId = previous.id;
    }
  }

  const id = uuidv4();
  db.insert(assessments)
    .values({
      id,
      household_id: input.household_id,
      head_citizen_id: input.head_citizen_id,
      pmt_score: input.pmt_score,
      income_band: input.income_band ?? incomeBandFromPmt(input.pmt_score),
      data_source: dataSource,
      assessed_at: assessedAt,
      valid_until: validUntil,
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .run();

  for (const ind of input.indicators ?? []) {
    db.insert(vulnerabilityIndicators)
      .values({
        id: uuidv4(),
        assessment_id: id,
        indicator: ind.indicator,
        value: ind.value ?? 1,
        weight: ind.weight ?? INDICATOR_WEIGHTS[ind.indicator],
      })
      .run();
  }

  const created = getAssessmentById(id)!;
  return {
    assessment: formatAssessment(created, getIndicators(id)),
    supersededId,
  };
}
