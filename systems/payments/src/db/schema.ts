import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";

/**
 * Ledger accounts. There is exactly one treasury account (the disbursing
 * government, owner_id = "treasury") and one account per citizen
 * (owner_id = citizen_id). `owner_id` is unique so opening an account is
 * idempotent per owner.
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  owner_type: text("owner_type", { enum: ["treasury", "citizen"] }).notNull(),
  owner_id: text("owner_id").notNull().unique(),
  balance: real("balance").notNull().default(0),
  currency: text("currency").notNull().default("SIM"),
  status: text("status", { enum: ["active", "closed"] })
    .notNull()
    .default("active"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/**
 * Disbursement requests (treasury -> citizen). A payment is *mocked*: no real
 * money moves; a completed payment only ever shows up as the paired ledger
 * entries below. The gateway fails at random per payments.config.ts, recording
 * the failure_code/message and leaving the ledger untouched.
 */
export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  idempotency_key: text("idempotency_key").notNull().unique(),
  from_account_id: text("from_account_id").references(() => accounts.id),
  to_account_id: text("to_account_id").references(() => accounts.id),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("SIM"),
  /** Optional link back to the Benefits enrollment this disburses against. */
  enrollment_id: text("enrollment_id"),
  /** Free-text reference (e.g. "Child Benefit 2025-04"). */
  reference: text("reference"),
  status: text("status", { enum: ["pending", "completed", "failed"] })
    .notNull()
    .default("pending"),
  failure_code: text("failure_code"),
  failure_message: text("failure_message"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completed_at: text("completed_at"),
});

/**
 * Double-entry ledger. Every completed payment writes exactly two rows: a
 * debit against the treasury account and a credit to the citizen account.
 */
export const ledgerEntries = sqliteTable("ledger_entries", {
  id: text("id").primaryKey(),
  payment_id: text("payment_id")
    .notNull()
    .references(() => payments.id),
  account_id: text("account_id")
    .notNull()
    .references(() => accounts.id),
  direction: text("direction", { enum: ["debit", "credit"] }).notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("SIM"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/**
 * Append-only log of every webhook this system has emitted. Used for
 * debugging OpenFn integrations — see GET /admin/webhooks.
 */
export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  source: text("source").notNull(),
  time: text("time").notNull(),
  data: text("data").notNull(),
  status: text("status", { enum: ["pending", "delivered", "failed", "skipped"] })
    .notNull()
    .default("pending"),
  error: text("error"),
});
