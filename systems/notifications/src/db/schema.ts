import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  citizen_id: text("citizen_id").notNull(),
  channel: text("channel", { enum: ["email", "sms"] }).notNull(),
  destination: text("destination").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  source_system: text("source_system").notNull(),
  source_event: text("source_event"),
  status: text("status", {
    enum: ["pending", "sent", "delivered", "failed"],
  })
    .notNull()
    .default("pending"),
  attempts: integer("attempts").notNull().default(0),
  sent_at: text("sent_at"),
  delivered_at: text("delivered_at"),
  failed_reason: text("failed_reason"),
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
