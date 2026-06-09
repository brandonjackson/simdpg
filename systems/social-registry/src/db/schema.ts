import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";

/**
 * A needs assessment for a household — the core record of the social registry.
 * Holds a proxy-means-test (PMT) score, an income band, and metadata about
 * how and when the assessment was taken. Benefits queries the most recent
 * `active` assessment for a household when targeting eligibility.
 */
export const assessments = sqliteTable("assessments", {
  id: text("id").primaryKey(),
  household_id: text("household_id").notNull(),
  head_citizen_id: text("head_citizen_id").notNull(),
  /** Proxy-means-test score, 0–100. Lower = poorer / more in need. */
  pmt_score: real("pmt_score").notNull(),
  income_band: text("income_band", {
    enum: ["low", "medium", "high"],
  }).notNull(),
  data_source: text("data_source", {
    enum: ["interview", "imported", "recertified"],
  })
    .notNull()
    .default("interview"),
  assessed_at: text("assessed_at").notNull(),
  valid_until: text("valid_until").notNull(),
  status: text("status", {
    enum: ["active", "expired", "superseded"],
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

/**
 * A single vulnerability flag attached to an assessment. The weighted sum of
 * the flags whose `value` is true contributes to the targeting determination.
 */
export const vulnerabilityIndicators = sqliteTable("vulnerability_indicators", {
  id: text("id").primaryKey(),
  assessment_id: text("assessment_id")
    .notNull()
    .references(() => assessments.id),
  indicator: text("indicator", {
    enum: [
      "disability",
      "elderly",
      "single_parent",
      "chronic_illness",
      "unemployed",
      "dependents",
    ],
  }).notNull(),
  /**
   * Magnitude of the indicator. Defaults to 1 for boolean-style flags
   * (disability, elderly, …); for `dependents` it carries the count.
   */
  value: real("value").notNull().default(1),
  /** Relative importance of this indicator in the targeting score. */
  weight: real("weight").notNull(),
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
 */
export const webhookSubscriptions = sqliteTable("webhook_subscriptions", {
  id: text("id").primaryKey(),
  event_type: text("event_type").notNull(),
  target_url: text("target_url").notNull(),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
