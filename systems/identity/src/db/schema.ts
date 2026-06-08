import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const citizens = sqliteTable("citizens", {
  id: text("id").primaryKey(),
  national_id: text("national_id").notNull().unique(),
  given_name: text("given_name").notNull(),
  family_name: text("family_name").notNull(),
  date_of_birth: text("date_of_birth").notNull(),
  sex: text("sex", { enum: ["male", "female"] }).notNull(),
  email: text("email"),
  phone_number: text("phone_number"),
  date_of_death: text("date_of_death"),
  status: text("status", { enum: ["alive", "deceased"] })
    .notNull()
    .default("alive"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const addresses = sqliteTable("addresses", {
  id: text("id").primaryKey(),
  citizen_id: text("citizen_id")
    .notNull()
    .references(() => citizens.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["residential", "mailing"] }).notNull(),
  line_1: text("line_1").notNull(),
  line_2: text("line_2"),
  city: text("city").notNull(),
  postal_code: text("postal_code").notNull(),
  from_date: text("from_date").notNull(),
  to_date: text("to_date"),
});

export const householdMembers = sqliteTable("household_members", {
  id: text("id").primaryKey(),
  household_id: text("household_id").notNull(),
  citizen_id: text("citizen_id")
    .notNull()
    .references(() => citizens.id, { onDelete: "cascade" }),
  relationship: text("relationship", {
    enum: ["head", "spouse", "child", "other"],
  }).notNull(),
  from_date: text("from_date").notNull(),
  to_date: text("to_date"),
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
