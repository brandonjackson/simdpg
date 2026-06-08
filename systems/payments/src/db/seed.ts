/**
 * Seed script — creates a funded treasury account, one account per seeded
 * citizen, and a handful of sample disbursements (completed + failed) so the
 * ledger has something to show.
 *
 * Run: npx tsx src/db/seed.ts  (from systems/payments/)
 */
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";
import { db, ensureTables } from "./index.js";
import { accounts, payments, ledgerEntries } from "./schema.js";

ensureTables();

// Check if data already exists
const count = db
  .select({ count: sql<number>`COUNT(*)` })
  .from(accounts)
  .get();

if (count && count.count > 0) {
  console.log(`Database already has ${count.count} accounts — skipping seed.`);
  process.exit(0);
}

console.log("Seeding payments database...");

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// Accounts — one treasury (the disbursing government) + one per citizen.
// Citizen IDs mirror the Benefits seed so disbursements line up across systems.
// ---------------------------------------------------------------------------

const TREASURY_BALANCE = 1_000_000;

const treasuryId = uuidv4();

db.insert(accounts)
  .values({
    id: treasuryId,
    owner_type: "treasury",
    owner_id: "treasury",
    balance: TREASURY_BALANCE,
    currency: "SIM",
    status: "active",
    created_at: now,
    updated_at: now,
  })
  .run();
console.log(`  Created treasury account funded with ${TREASURY_BALANCE} SIM`);

const citizenIds = [
  "c1000000-0000-4000-8000-000000000001",
  "c1000000-0000-4000-8000-000000000002",
  "c1000000-0000-4000-8000-000000000003",
  "c1000000-0000-4000-8000-000000000004",
  "c1000000-0000-4000-8000-000000000005",
];

const citizenAccountIds: string[] = [];
for (const citizenId of citizenIds) {
  const id = uuidv4();
  db.insert(accounts)
    .values({
      id,
      owner_type: "citizen",
      owner_id: citizenId,
      balance: 0,
      currency: "SIM",
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .run();
  citizenAccountIds.push(id);
}
console.log(`  Created ${citizenAccountIds.length} citizen accounts`);

// ---------------------------------------------------------------------------
// Sample disbursements — written directly (bypassing the random gateway) so
// the seed is deterministic. Two completed (with paired ledger entries) and
// one failed.
// ---------------------------------------------------------------------------

/** Record a completed disbursement: payment row + debit/credit + balances. */
function disburse(
  toAccountId: string,
  amount: number,
  reference: string,
): void {
  const paymentId = uuidv4();
  db.insert(payments)
    .values({
      id: paymentId,
      idempotency_key: `seed-${paymentId}`,
      from_account_id: treasuryId,
      to_account_id: toAccountId,
      amount,
      currency: "SIM",
      enrollment_id: null,
      reference,
      status: "completed",
      failure_code: null,
      failure_message: null,
      created_at: now,
      completed_at: now,
    })
    .run();

  db.insert(ledgerEntries)
    .values([
      {
        id: uuidv4(),
        payment_id: paymentId,
        account_id: treasuryId,
        direction: "debit",
        amount,
        currency: "SIM",
        created_at: now,
      },
      {
        id: uuidv4(),
        payment_id: paymentId,
        account_id: toAccountId,
        direction: "credit",
        amount,
        currency: "SIM",
        created_at: now,
      },
    ])
    .run();

  db.update(accounts)
    .set({ balance: sql`${accounts.balance} + ${amount}`, updated_at: now })
    .where(sql`${accounts.id} = ${toAccountId}`)
    .run();
  db.update(accounts)
    .set({ balance: sql`${accounts.balance} - ${amount}`, updated_at: now })
    .where(sql`${accounts.id} = ${treasuryId}`)
    .run();
}

disburse(citizenAccountIds[0], 150, "Child Benefit 2025-03");
disburse(citizenAccountIds[2], 500, "Senior Pension 2025-03");

// One failed disbursement (gateway timeout) — no ledger movement.
const failedId = uuidv4();
db.insert(payments)
  .values({
    id: failedId,
    idempotency_key: `seed-${failedId}`,
    from_account_id: treasuryId,
    to_account_id: citizenAccountIds[1],
    amount: 150,
    currency: "SIM",
    enrollment_id: null,
    reference: "Child Benefit 2025-03",
    status: "failed",
    failure_code: "GATEWAY_TIMEOUT",
    failure_message: "The upstream banking partner did not respond in time.",
    created_at: now,
    completed_at: null,
  })
  .run();

console.log("  Created 2 completed disbursements and 1 failed disbursement");

console.log("\nSeed complete!");
