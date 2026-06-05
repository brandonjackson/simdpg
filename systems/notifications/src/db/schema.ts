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
