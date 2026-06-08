/**
 * Seed script — creates needs assessments for 4 households with a realistic
 * spread of PMT scores and vulnerability indicators.
 * Run: npx tsx src/db/seed.ts  (from systems/social-registry/)
 */
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";
import { db, ensureTables } from "./index.js";
import { assessments, vulnerabilityIndicators } from "./schema.js";
import { INDICATOR_WEIGHTS, incomeBandFromPmt } from "../targeting.js";

ensureTables();

const count = db
  .select({ count: sql<number>`COUNT(*)` })
  .from(assessments)
  .get();

if (count && count.count > 0) {
  console.log(
    `Database already has ${count.count} assessments — skipping seed.`,
  );
  process.exit(0);
}

console.log("Seeding social-registry database...");

const now = new Date().toISOString();

// Stable fake household / citizen IDs, aligned with the Benefits seed so the
// two systems reference recognisably-related records. `months_ago` keeps the
// seed evergreen: assessments are dated relative to now so they stay within
// their 12-month validity window whenever the seed is run.
const seed: {
  household_id: string;
  head_citizen_id: string;
  pmt_score: number;
  months_ago: number;
  data_source: "interview" | "imported" | "recertified";
  indicators: (keyof typeof INDICATOR_WEIGHTS)[];
}[] = [
  {
    household_id: "h2000000-0000-4000-8000-000000000001",
    head_citizen_id: "c1000000-0000-4000-8000-000000000001",
    pmt_score: 18,
    months_ago: 5,
    data_source: "interview",
    indicators: ["single_parent", "dependents"],
  },
  {
    household_id: "h2000000-0000-4000-8000-000000000002",
    head_citizen_id: "c1000000-0000-4000-8000-000000000002",
    pmt_score: 41,
    months_ago: 4,
    data_source: "interview",
    indicators: ["unemployed"],
  },
  {
    household_id: "h2000000-0000-4000-8000-000000000003",
    head_citizen_id: "c1000000-0000-4000-8000-000000000003",
    pmt_score: 35,
    months_ago: 6,
    data_source: "imported",
    indicators: ["elderly", "disability"],
  },
  {
    household_id: "h2000000-0000-4000-8000-000000000004",
    head_citizen_id: "c1000000-0000-4000-8000-000000000004",
    pmt_score: 78,
    months_ago: 3,
    data_source: "interview",
    indicators: [],
  },
];

/** Add `months` to an ISO date string. */
function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

for (const row of seed) {
  const id = uuidv4();
  const assessedAt = addMonths(now, -row.months_ago);
  db.insert(assessments)
    .values({
      id,
      household_id: row.household_id,
      head_citizen_id: row.head_citizen_id,
      pmt_score: row.pmt_score,
      income_band: incomeBandFromPmt(row.pmt_score),
      data_source: row.data_source,
      assessed_at: assessedAt,
      valid_until: addMonths(assessedAt, 12),
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .run();

  for (const indicator of row.indicators) {
    db.insert(vulnerabilityIndicators)
      .values({
        id: uuidv4(),
        assessment_id: id,
        indicator,
        value: 1,
        weight: INDICATOR_WEIGHTS[indicator],
      })
      .run();
  }

  console.log(
    `  Assessed household ${row.household_id.slice(-4)} — PMT ${row.pmt_score} (${incomeBandFromPmt(row.pmt_score)}), ${row.indicators.length} indicator(s)`,
  );
}

console.log("\nSeed complete!");
