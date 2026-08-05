/**
 * Benefit programmes are *reference* data, not population data: workflows and
 * demos address them by ID, and wiping them breaks every integration pointing
 * at this system. Two things follow from that, and this module exists to
 * guarantee both.
 *
 * 1. **The IDs are stable.** They are hard-coded here rather than generated
 *    with `uuidv4()` at seed time, so a workflow (or a saved OpenFn job) can
 *    hard-code a `program_id` and still resolve it after a re-seed, a volume
 *    replacement, or a fresh deploy. They keep the shape used elsewhere in the
 *    seeds (`c1000000-…` citizens, `h2000000-…` households) and are valid v4
 *    UUIDs, so they satisfy the `uuid()` validation on `/eligibility/check`.
 *
 * 2. **They come back on their own.** `ensureReferencePrograms()` is called on
 *    every server start, not just from the seed script. The seed is one-shot —
 *    it skips a non-empty database, and the container entrypoint additionally
 *    gates it behind a `data/.seeded` marker that lives on the persistent
 *    volume — so before this existed, an emptied `programs` table stayed empty
 *    for good and the system served `{"data":[]}` forever.
 */
import { inArray } from "drizzle-orm";
import { db as defaultDb } from "./index.js";
import { programs } from "./schema.js";

/** Stable programme IDs, safe to reference from workflows and job code. */
export const PROGRAM_IDS = {
  childBenefit: "b1000000-0000-4000-8000-000000000001",
  seniorPension: "b1000000-0000-4000-8000-000000000002",
  maternityGrant: "b1000000-0000-4000-8000-000000000003",
  childProtection: "b1000000-0000-4000-8000-000000000004",
} as const;

/** A programme definition, minus the timestamps applied when it is inserted. */
export interface ReferenceProgram {
  id: string;
  name: string;
  description: string;
  /** Free-form; echoed back by `/eligibility/check` for workflows to evaluate. */
  eligibility_rules: Record<string, unknown>;
  payment_amount: number;
  payment_frequency: "monthly" | "one-time" | "quarterly";
  status: "active" | "suspended" | "closed";
}

export const REFERENCE_PROGRAMS: ReferenceProgram[] = [
  {
    id: PROGRAM_IDS.childBenefit,
    name: "Child Benefit",
    description:
      "Monthly cash transfer for households with children under 18 years of age.",
    eligibility_rules: { max_age: 18 },
    payment_amount: 150,
    payment_frequency: "monthly",
    status: "active",
  },
  {
    id: PROGRAM_IDS.seniorPension,
    name: "Senior Pension",
    description:
      "Monthly pension for citizens aged 65 and above to support retirement.",
    eligibility_rules: { min_age: 65 },
    payment_amount: 500,
    payment_frequency: "monthly",
    status: "active",
  },
  {
    id: PROGRAM_IDS.maternityGrant,
    name: "Maternity Grant",
    description:
      "One-time grant for new mothers to cover costs associated with childbirth.",
    eligibility_rules: {},
    payment_amount: 1000,
    payment_frequency: "one-time",
    status: "active",
  },
  {
    // Referral-driven child protection support. `/eligibility/check` is a stub
    // that always passes, so the rules below are here to be *read* by a
    // workflow that does the real decision — the same pattern the
    // "Check benefit eligibility" workflows use for the age test.
    id: PROGRAM_IDS.childProtection,
    name: "Child Protection Support",
    description:
      "Case-managed monthly support for children identified as at risk, opened on referral from a social worker, clinic, or school.",
    eligibility_rules: {
      max_age: 18,
      requires_referral: true,
      vulnerability_indicators: ["single_parent", "dependents"],
    },
    payment_amount: 300,
    payment_frequency: "monthly",
    status: "active",
  },
];

/**
 * Insert any reference programme that is missing, and leave everything else
 * alone. Idempotent, so it is safe to call on every start.
 *
 * A programme is considered present if its stable ID *or* its name is already
 * in the table. Matching on name too means a database seeded before the IDs
 * were stabilised — where "Child Benefit" exists under a random UUID — does
 * not end up with the programme twice. Existing rows are never overwritten, so
 * programmes created or edited through the API survive untouched.
 *
 * @returns the names of the programmes it created.
 */
export function ensureReferencePrograms(db = defaultDb): string[] {
  const wanted = REFERENCE_PROGRAMS;

  const existing = db
    .select({ id: programs.id, name: programs.name })
    .from(programs)
    .where(
      inArray(
        programs.id,
        wanted.map((p) => p.id),
      ),
    )
    .all();

  const existingIds = new Set(existing.map((row) => row.id));

  // Names are compared case-insensitively: the point is to avoid a visible
  // duplicate in the portal's programme list, and "child benefit" would read
  // as one.
  const existingNames = new Set(
    db
      .select({ name: programs.name })
      .from(programs)
      .all()
      .map((row) => row.name.trim().toLowerCase()),
  );

  const missing = wanted.filter(
    (p) => !existingIds.has(p.id) && !existingNames.has(p.name.toLowerCase()),
  );

  if (missing.length === 0) return [];

  const now = new Date().toISOString();

  for (const p of missing) {
    db.insert(programs)
      .values({
        id: p.id,
        name: p.name,
        description: p.description,
        eligibility_rules: JSON.stringify(p.eligibility_rules),
        payment_amount: p.payment_amount,
        payment_frequency: p.payment_frequency,
        status: p.status,
        created_at: now,
        updated_at: now,
      })
      .run();
  }

  return missing.map((p) => p.name);
}
