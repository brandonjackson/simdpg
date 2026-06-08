import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";

export const programs = sqliteTable("programs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  eligibility_rules: text("eligibility_rules").notNull(),
  payment_amount: real("payment_amount").notNull(),
  payment_frequency: text("payment_frequency", {
    enum: ["monthly", "one-time", "quarterly"],
  }).notNull(),
  status: text("status", {
    enum: ["active", "suspended", "closed"],
  })
    .notNull()
    .default("active"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const enrollments = sqliteTable("enrollments", {
  id: text("id").primaryKey(),
  program_id: text("program_id")
    .notNull()
    .references(() => programs.id),
  citizen_id: text("citizen_id").notNull(),
  household_id: text("household_id"),
  status: text("status", {
    enum: ["pending", "active", "suspended", "terminated"],
  })
    .notNull()
    .default("pending"),
  enrolled_at: text("enrolled_at").notNull(),
  terminated_at: text("terminated_at"),
  termination_reason: text("termination_reason"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  enrollment_id: text("enrollment_id")
    .notNull()
    .references(() => enrollments.id),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("SIM"),
  status: text("status", {
    enum: ["scheduled", "paid", "failed"],
  })
    .notNull()
    .default("scheduled"),
  scheduled_date: text("scheduled_date").notNull(),
  paid_date: text("paid_date"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updated_at: text("updated_at")
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
