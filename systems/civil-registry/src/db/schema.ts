import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const birthRegistrations = sqliteTable("birth_registrations", {
  id: text("id").primaryKey(),
  child_citizen_id: text("child_citizen_id").notNull(),
  mother_citizen_id: text("mother_citizen_id").notNull(),
  father_citizen_id: text("father_citizen_id"),
  date_of_birth: text("date_of_birth").notNull(),
  place_of_birth: text("place_of_birth").notNull(),
  registration_date: text("registration_date").notNull(),
  registrar_notes: text("registrar_notes"),
  status: text("status", { enum: ["registered", "amended", "cancelled"] })
    .notNull()
    .default("registered"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const deathRegistrations = sqliteTable("death_registrations", {
  id: text("id").primaryKey(),
  citizen_id: text("citizen_id").notNull(),
  date_of_death: text("date_of_death").notNull(),
  place_of_death: text("place_of_death").notNull(),
  cause_of_death: text("cause_of_death"),
  registration_date: text("registration_date").notNull(),
  status: text("status", { enum: ["registered", "amended", "cancelled"] })
    .notNull()
    .default("registered"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const marriageRegistrations = sqliteTable("marriage_registrations", {
  id: text("id").primaryKey(),
  spouse_1_citizen_id: text("spouse_1_citizen_id").notNull(),
  spouse_2_citizen_id: text("spouse_2_citizen_id").notNull(),
  date_of_marriage: text("date_of_marriage").notNull(),
  place_of_marriage: text("place_of_marriage").notNull(),
  registration_date: text("registration_date").notNull(),
  status: text("status", { enum: ["registered", "divorced", "annulled"] })
    .notNull()
    .default("registered"),
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
