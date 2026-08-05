/**
 * Seed script — ensures the reference programmes exist, then creates 6
 * enrollments and 12 payments.
 * Run: npx tsx src/db/seed.ts  (from systems/benefits/)
 *
 * The two halves are guarded separately. Programmes are reference data with
 * stable IDs (see reference-data.ts) and are ensured on every run — the server
 * does the same on start, so they cannot go permanently missing. Enrollments
 * and payments are population data: they are seeded only into an empty table,
 * because `/admin/reset` and the simulation engine both own them legitimately
 * and re-seeding would fight with that.
 */
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";
import { db, ensureTables } from "./index.js";
import { enrollments, payments } from "./schema.js";
import { PROGRAM_IDS, ensureReferencePrograms } from "./reference-data.js";

ensureTables();

console.log("Seeding benefits database...");

// ---------------------------------------------------------------------------
// Programs (reference data — idempotent)
// ---------------------------------------------------------------------------

const createdPrograms = ensureReferencePrograms();
if (createdPrograms.length > 0) {
  for (const name of createdPrograms) {
    console.log(`  Created program: ${name}`);
  }
} else {
  console.log("  Programs already present — nothing to add.");
}

const childBenefitId = PROGRAM_IDS.childBenefit;
const seniorPensionId = PROGRAM_IDS.seniorPension;
const maternityGrantId = PROGRAM_IDS.maternityGrant;
const childProtectionId = PROGRAM_IDS.childProtection;

// ---------------------------------------------------------------------------
// Enrollments + payments (population data — only into an empty table)
// ---------------------------------------------------------------------------

const enrollmentCount = db
  .select({ count: sql<number>`COUNT(*)` })
  .from(enrollments)
  .get();

if (enrollmentCount && enrollmentCount.count > 0) {
  console.log(
    `  Database already has ${enrollmentCount.count} enrollments — skipping population data.`,
  );
  process.exit(0);
}

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

// Use stable fake citizen IDs so the seed is reproducible
const citizenIds = [
  "c1000000-0000-4000-8000-000000000001",
  "c1000000-0000-4000-8000-000000000002",
  "c1000000-0000-4000-8000-000000000003",
  "c1000000-0000-4000-8000-000000000004",
  "c1000000-0000-4000-8000-000000000005",
];

const householdIds = [
  "h2000000-0000-4000-8000-000000000001",
  "h2000000-0000-4000-8000-000000000002",
];

const enrollmentIds: string[] = [];

const seedEnrollments = [
  {
    id: uuidv4(),
    program_id: childBenefitId,
    citizen_id: citizenIds[0],
    household_id: householdIds[0],
    status: "active" as const,
    enrolled_at: "2025-01-15T10:00:00.000Z",
    terminated_at: null,
    termination_reason: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: uuidv4(),
    program_id: childBenefitId,
    citizen_id: citizenIds[1],
    household_id: householdIds[1],
    status: "active" as const,
    enrolled_at: "2025-02-01T09:30:00.000Z",
    terminated_at: null,
    termination_reason: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: uuidv4(),
    program_id: seniorPensionId,
    citizen_id: citizenIds[2],
    household_id: null,
    status: "active" as const,
    enrolled_at: "2025-01-10T08:00:00.000Z",
    terminated_at: null,
    termination_reason: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: uuidv4(),
    program_id: seniorPensionId,
    citizen_id: citizenIds[3],
    household_id: null,
    status: "terminated" as const,
    enrolled_at: "2024-06-01T12:00:00.000Z",
    terminated_at: "2025-03-15T14:00:00.000Z",
    termination_reason: "Citizen relocated out of jurisdiction",
    created_at: now,
    updated_at: now,
  },
  {
    id: uuidv4(),
    program_id: maternityGrantId,
    citizen_id: citizenIds[4],
    household_id: householdIds[0],
    status: "active" as const,
    enrolled_at: "2025-03-20T11:00:00.000Z",
    terminated_at: null,
    termination_reason: null,
    created_at: now,
    updated_at: now,
  },
  // An open child protection case, so the programme has history behind it when
  // a demo enrols someone new into it.
  {
    id: uuidv4(),
    program_id: childProtectionId,
    citizen_id: citizenIds[0],
    household_id: householdIds[0],
    status: "active" as const,
    enrolled_at: "2025-02-10T13:00:00.000Z",
    terminated_at: null,
    termination_reason: null,
    created_at: now,
    updated_at: now,
  },
];

for (const e of seedEnrollments) {
  db.insert(enrollments).values(e).run();
  enrollmentIds.push(e.id);
  console.log(
    `  Created enrollment: citizen ${e.citizen_id.slice(-4)} -> program ${e.program_id.slice(0, 8)}... (${e.status})`,
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** Add N months to a date string, returning YYYY-MM-DD. */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

const seedPayments = [
  // 3 monthly payments for enrollment 0 (Child Benefit, citizen 1)
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[0],
    amount: 150,
    currency: "SIM",
    status: "paid" as const,
    scheduled_date: "2025-02-01",
    paid_date: "2025-02-01T09:00:00.000Z",
    created_at: now,
    updated_at: now,
  },
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[0],
    amount: 150,
    currency: "SIM",
    status: "paid" as const,
    scheduled_date: "2025-03-01",
    paid_date: "2025-03-01T09:00:00.000Z",
    created_at: now,
    updated_at: now,
  },
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[0],
    amount: 150,
    currency: "SIM",
    status: "scheduled" as const,
    scheduled_date: "2025-04-01",
    paid_date: null,
    created_at: now,
    updated_at: now,
  },
  // 2 monthly payments for enrollment 1 (Child Benefit, citizen 2)
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[1],
    amount: 150,
    currency: "SIM",
    status: "paid" as const,
    scheduled_date: "2025-03-01",
    paid_date: "2025-03-02T10:30:00.000Z",
    created_at: now,
    updated_at: now,
  },
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[1],
    amount: 150,
    currency: "SIM",
    status: "scheduled" as const,
    scheduled_date: "2025-04-01",
    paid_date: null,
    created_at: now,
    updated_at: now,
  },
  // 3 monthly payments for enrollment 2 (Senior Pension, citizen 3)
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[2],
    amount: 500,
    currency: "SIM",
    status: "paid" as const,
    scheduled_date: "2025-02-01",
    paid_date: "2025-02-01T08:00:00.000Z",
    created_at: now,
    updated_at: now,
  },
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[2],
    amount: 500,
    currency: "SIM",
    status: "paid" as const,
    scheduled_date: "2025-03-01",
    paid_date: "2025-03-01T08:00:00.000Z",
    created_at: now,
    updated_at: now,
  },
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[2],
    amount: 500,
    currency: "SIM",
    status: "scheduled" as const,
    scheduled_date: "2025-04-01",
    paid_date: null,
    created_at: now,
    updated_at: now,
  },
  // 1 failed payment for enrollment 3 (terminated Senior Pension)
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[3],
    amount: 500,
    currency: "SIM",
    status: "failed" as const,
    scheduled_date: "2025-03-01",
    paid_date: null,
    created_at: now,
    updated_at: now,
  },
  // 1 paid payment for enrollment 4 (Maternity Grant, one-time)
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[4],
    amount: 1000,
    currency: "SIM",
    status: "paid" as const,
    scheduled_date: "2025-03-20",
    paid_date: "2025-03-20T14:00:00.000Z",
    created_at: now,
    updated_at: now,
  },
  // 2 monthly payments for enrollment 5 (Child Protection Support)
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[5],
    amount: 300,
    currency: "SIM",
    status: "paid" as const,
    scheduled_date: "2025-03-01",
    paid_date: "2025-03-01T09:15:00.000Z",
    created_at: now,
    updated_at: now,
  },
  {
    id: uuidv4(),
    enrollment_id: enrollmentIds[5],
    amount: 300,
    currency: "SIM",
    status: "scheduled" as const,
    scheduled_date: "2025-04-01",
    paid_date: null,
    created_at: now,
    updated_at: now,
  },
];

for (const p of seedPayments) {
  db.insert(payments).values(p).run();
}

console.log(`  Created ${seedPayments.length} payments`);

console.log("\nSeed complete!");
