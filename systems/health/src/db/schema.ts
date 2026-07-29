import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const patients = sqliteTable("patients", {
  id: text("id").primaryKey(),
  citizen_id: text("citizen_id").notNull(),
  blood_type: text("blood_type"),
  allergies: text("allergies"),
  registered_at: text("registered_at").notNull(),
  status: text("status", { enum: ["active", "deceased", "inactive"] })
    .notNull()
    .default("active"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const encounters = sqliteTable("encounters", {
  id: text("id").primaryKey(),
  patient_id: text("patient_id")
    .notNull()
    .references(() => patients.id),
  type: text("type", {
    enum: ["checkup", "emergency", "vaccination", "consultation"],
  }).notNull(),
  date: text("date").notNull(),
  facility: text("facility").notNull(),
  provider: text("provider").notNull(),
  diagnosis: text("diagnosis"),
  notes: text("notes"),
  status: text("status", {
    enum: ["completed", "scheduled", "cancelled"],
  })
    .notNull()
    .default("completed"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const vaccinations = sqliteTable("vaccinations", {
  id: text("id").primaryKey(),
  patient_id: text("patient_id")
    .notNull()
    .references(() => patients.id),
  encounter_id: text("encounter_id").references(() => encounters.id),
  vaccine_name: text("vaccine_name").notNull(),
  dose_number: integer("dose_number").notNull(),
  date_administered: text("date_administered").notNull(),
  next_dose_due: text("next_dose_due"),
  batch_number: text("batch_number").notNull(),
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

/**
 * Per-event webhook subscriptions. Each emitted event is delivered to every
 * row whose `event_type` matches; multiple rows per event are allowed.
 *
 * `project_id` records which portal project (i.e. which OpenFn project) a URL
 * was registered for, so several projects' registrations can sit side by side
 * and be listed and removed separately. It groups rows only: delivery still
 * fans out to every row matching the event type, because a system emits an
 * event without knowing which project's workflow caused the change. Null on
 * rows registered before projects existed.
 */
export const webhookSubscriptions = sqliteTable("webhook_subscriptions", {
  id: text("id").primaryKey(),
  event_type: text("event_type").notNull(),
  target_url: text("target_url").notNull(),
  project_id: text("project_id"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
