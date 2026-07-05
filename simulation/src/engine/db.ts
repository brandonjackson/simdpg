import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { simDbPath } from "./paths.js";

/**
 * The worker touches two of the portal's tables: it updates the authoritative
 * `simulations` record on terminal states, and owns the `simulation_runs` row.
 * These definitions must stay in step with portal/src/lib/db/schema.ts.
 */
export const simulations = sqliteTable("simulations", {
  id: text("id").primaryKey(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  status: text("status").notNull(),
  parameters: text("parameters").notNull(),
  generated_at: text("generated_at"),
  started_at: text("started_at"),
  stopped_at: text("stopped_at"),
  completed_at: text("completed_at"),
  stats: text("stats"),
});

export const simulationRuns = sqliteTable("simulation_runs", {
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
});

const schema = { simulations, simulationRuns };

let cached: BetterSQLite3Database<typeof schema> | null = null;

/**
 * Open (once) the SQLite database shared with the portal and ensure its tables
 * exist. Lazy so that importing the worker entry for a non-`run` command (e.g.
 * `sim:generate`) doesn't create an unused database file in the working dir.
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (cached) return cached;

  const dbPath = simDbPath();
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");

  // Create the shared tables if absent. IF NOT EXISTS keeps this safe when the
  // portal already created them; the DDL mirrors the portal's ensureTables so a
  // worker that boots first produces an identical schema.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS simulations (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      status       TEXT NOT NULL,
      parameters   TEXT NOT NULL,
      generated_at TEXT,
      started_at   TEXT,
      stopped_at   TEXT,
      completed_at TEXT,
      stats        TEXT
    );

    CREATE TABLE IF NOT EXISTS simulation_runs (
      simulation_id TEXT PRIMARY KEY,
      pid           INTEGER,
      status        TEXT NOT NULL,
      started_at    TEXT NOT NULL,
      completed_at  TEXT,
      error         TEXT,
      delivered     INTEGER NOT NULL DEFAULT 0,
      skipped       INTEGER NOT NULL DEFAULT 0,
      failed        INTEGER NOT NULL DEFAULT 0,
      total         INTEGER NOT NULL DEFAULT 0,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS form_webhooks (
      key        TEXT PRIMARY KEY,
      target_url TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(status);
    CREATE INDEX IF NOT EXISTS idx_simulation_runs_status ON simulation_runs(status);
  `);

  cached = drizzle(sqlite, { schema });
  return cached;
}
