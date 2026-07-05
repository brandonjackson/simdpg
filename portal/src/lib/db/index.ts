import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";
import { simDbPath } from "../simulations/paths";

type Db = BetterSQLite3Database<typeof schema>;

let cached: Db | null = null;

/**
 * Open (once) the portal's SQLite database, set pragmas, and ensure its tables
 * exist. Initialization is lazy — deferred to the first `getDb()` call — so that
 * merely importing this module has no side effects. That matters during
 * `next build`: Next imports every route module to collect page data (across
 * several worker processes), and if opening the connection happened at import
 * time, the concurrent workers would each try to set `journal_mode = WAL` on the
 * same file and collide with SQLITE_BUSY ("database is locked"). Opening on first
 * use instead keeps the build side-effect-free and only touches the DB at runtime.
 */
export function getDb(): Db {
  if (cached) return cached;

  const dbPath = simDbPath();

  // Ensure the data directory exists (fresh checkout / fresh volume).
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(dbPath);

  // WAL improves concurrent reads; busy_timeout lets the portal and the separate
  // worker process both write (each on its own connection) without hitting
  // SQLITE_BUSY under the brief contention this demo produces.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");

  // Create the portal's tables if they don't already exist. Uses IF NOT EXISTS so
  // it's safe to run on every startup (and matches the worker's own bootstrap in
  // simulation/src/engine/db.ts — keep the two DDLs in step).
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
