/**
 * Seed script — creates 3 programs, 5 enrollments, and 10 payments.
 * Run: npx tsx src/db/seed.ts  (from systems/benefits/)
 */
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";
import { db, ensureTables } from "./index.js";
import { programs, enrollments, payments } from "./schema.js";

ensureTables();

// Check if data already exists
const count = db
  .select({ count: sql<number>`COUNT(*)` })
  .from(programs)
  .get();

if (count && count.count > 0) {
  console.log(`Database already has ${count.count} programs — skipping seed.`);
  process.exit(0);
}

console.log("Seeding benefits database...");

const now = new Date().toISOString();
const today = now.split("T")[0];

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

const childBenefitId = uuidv4();
const seniorPensionId = uuidv4();
const maternityGrantId = uuidv4();

const seedPrograms = [
  {
    id: childBenefitId,
    name: "Child Benefit",
    description:
      "Monthly cash transfer for households with children under 18 years of age.",
    eligibility_rules: JSON.stringify({ max_age: 18 }),
    payment_amount: 150,
    payment_frequency: "monthly" as const,
    status: "active" as const,
    created_at: now,
    updated_at: now,
  },
  {
    id: seniorPensionId,
    name: "Senior Pension",
    description:
      "Monthly pension for citizens aged 65 and above to support retirement.",
    eligibility_rules: JSON.stringify({ min_age: 65 }),
    payment_amount: 500,
    payment_frequency: "monthly" as const,
    status: "active" as const,
    created_at: now,
    updated_at: now,
  },
  {
    id: maternityGrantId,
    name: "Maternity Grant",
    description:
      "One-time grant for new mothers to cover costs associated with childbirth.",
    eligibility_rules: JSON.stringify({}),
    payment_amount: 1000,
    payment_frequency: "one-time" as const,
    status: "active" as const,
    created_at: now,
    updated_at: now,
  },
];

for (const p of seedPrograms) {
  db.insert(programs).values(p).run();
  console.log(`  Created program: ${p.name}`);
}

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
];

for (const p of seedPayments) {
  db.insert(payments).values(p).run();
}

console.log(`  Created ${seedPayments.length} payments`);

console.log("\nSeed complete!");
