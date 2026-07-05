import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * A simulation's authoritative lifecycle record — the single source of truth
 * for its status. The portal writes create/generate/start/stop transitions; the
 * worker writes the terminal status + stats when a run ends. Because the record
 * is kept current by whoever changes it, a read needs no run-state
 * reconciliation (the old JSON model merged the worker's status at read time).
 */
export const simulations = sqliteTable(
  "simulations",
  {
    id: text("id").primaryKey(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    status: text("status", {
      enum: ["created", "generated", "running", "stopped", "completed", "failed"],
    }).notNull(),
    /** JSON-encoded SimulationParameters. */
    parameters: text("parameters").notNull(),
    generated_at: text("generated_at"),
    started_at: text("started_at"),
    stopped_at: text("stopped_at"),
    completed_at: text("completed_at"),
    /** JSON-encoded stats (delivered/skipped/failed/total, optional error). */
    stats: text("stats"),
  },
  (table) => ({
    statusIdx: index("idx_simulations_status").on(table.status),
  }),
);

/**
 * Per-simulation run-state, owned by the worker process (one row per
 * simulation). Carries the worker pid, live status, delivery counts, and an
 * updated_at heartbeat — so mid-run progress is durable and a crashed or
 * abandoned `running` run is detectable via query (enables a future reaper).
 */
export const simulationRuns = sqliteTable(
  "simulation_runs",
  {
    simulation_id: text("simulation_id").primaryKey(),
    pid: integer("pid"),
    status: text("status", {
      enum: ["running", "completed", "stopped", "failed"],
    }).notNull(),
    started_at: text("started_at").notNull(),
    completed_at: text("completed_at"),
    error: text("error"),
    delivered: integer("delivered").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    total: integer("total").notNull().default(0),
    updated_at: text("updated_at").notNull(),
  },
  (table) => ({
    statusIdx: index("idx_simulation_runs_status").on(table.status),
  }),
);

/**
 * Webhook URL registered for each portal form-submission hook. Replaces the old
 * .form-webhooks.json file so registrations persist on the same volume as the
 * simulation tables instead of the portal's ephemeral working directory.
 */
export const formWebhooks = sqliteTable("form_webhooks", {
  key: text("key").primaryKey(),
  target_url: text("target_url").notNull(),
  updated_at: text("updated_at").notNull(),
});
