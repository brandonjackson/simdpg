import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  checkDbHealth,
  dbHealthFailure,
  schemaTableSpecs,
  type DbHealthReport,
} from "@simdpg/system-kit/db-health";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";
import { simDbPath } from "../simulations/paths";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Id of the project that always exists. Webhook registrations made before
 * projects were introduced are migrated onto it, live portal form submissions
 * fall back to it, and it can't be deleted while it is the only project — so
 * there is always somewhere for a registration to live. The id is a fixed
 * string (not a UUID) so the portal and the worker can both bootstrap it
 * idempotently without coordinating.
 */
export const DEFAULT_PROJECT_ID = "default";

/** Name given to {@link DEFAULT_PROJECT_ID} when it is first created. */
export const DEFAULT_PROJECT_NAME = "Default project";

let cached: Db | null = null;
/** The connection behind {@link cached}, kept for the health check's PRAGMAs. */
let cachedSqlite: Database.Database | null = null;

/** Column names of an existing table (empty when the table doesn't exist). */
function columnsOf(sqlite: Database.Database, table: string): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return rows.map((r) => r.name);
}

/**
 * Move a pre-projects `form_webhooks` table (one row per form key) onto the
 * project-scoped shape (one row per project *and* form key), assigning every
 * existing registration to the default project. SQLite can't add a column to a
 * primary key, so the table is rebuilt and copied. A no-op once migrated, and on
 * a fresh database where the table is created in its current shape.
 */
function migrateFormWebhooksToProjects(sqlite: Database.Database): void {
  const columns = columnsOf(sqlite, "form_webhooks");
  if (columns.length === 0 || columns.includes("project_id")) return;

  sqlite.exec(`
    ALTER TABLE form_webhooks RENAME TO form_webhooks_pre_projects;

    CREATE TABLE form_webhooks (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      target_url TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, key)
    );

    INSERT INTO form_webhooks (project_id, key, target_url, updated_at)
      SELECT '${DEFAULT_PROJECT_ID}', key, target_url, updated_at
      FROM form_webhooks_pre_projects;

    DROP TABLE form_webhooks_pre_projects;
  `);
}

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
  // form_webhooks rows are owned by a project; enforcement makes deleting a
  // project drop its registrations with it.
  sqlite.pragma("foreign_keys = ON");

  // Create the portal's tables if they don't already exist. Uses IF NOT EXISTS so
  // it's safe to run on every startup (and matches the worker's own bootstrap in
  // simulation/src/engine/db.ts — keep the two DDLs in step).
  //
  // `projects` and its default row come first: the form_webhooks migration below
  // assigns pre-projects registrations to the default project, and the current
  // form_webhooks shape has a foreign key to it.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      is_default  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    INSERT OR IGNORE INTO projects (id, name, description, is_default, created_at, updated_at)
      VALUES (
        '${DEFAULT_PROJECT_ID}',
        '${DEFAULT_PROJECT_NAME}',
        'The OpenFn project live portal form submissions are sent to.',
        1,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );
  `);

  migrateFormWebhooksToProjects(sqlite);

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

    CREATE TABLE IF NOT EXISTS simulation_scripts (
      simulation_id TEXT PRIMARY KEY,
      events        TEXT NOT NULL,
      generation    TEXT,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS form_webhooks (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      target_url TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, key)
    );

    CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(status);
    CREATE INDEX IF NOT EXISTS idx_simulation_runs_status ON simulation_runs(status);
    CREATE INDEX IF NOT EXISTS idx_form_webhooks_project ON form_webhooks(project_id);
  `);

  cachedSqlite = sqlite;
  cached = drizzle(sqlite, { schema });
  return cached;
}

/**
 * `projects` always holds at least the default row: the bootstrap above
 * re-inserts it on every start and a project can't be deleted while it is the
 * last one. An empty table therefore means writes aren't reaching the file.
 * The rest of the portal's tables are legitimately empty on a fresh install.
 */
const ROW_EXPECTATIONS = { projects: "always" } as const;

/**
 * Report on the portal's own database, in the same shape the systems serve at
 * `/admin/db-health`.
 *
 * Deliberately never throws. The failure this exists to surface — a volume
 * that isn't mounted, a read-only file, a schema that predates this build — is
 * one where the honest answer is a report saying so, not an exception that
 * some caller further up swallows into an empty page.
 */
export function checkPortalDatabase(): DbHealthReport {
  const file = simDbPath();

  try {
    getDb();
  } catch (err) {
    return dbHealthFailure(
      "portal",
      file,
      `The database could not be opened: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!cachedSqlite) {
    return dbHealthFailure("portal", file, "The database connection is missing.");
  }

  return checkDbHealth({
    service: "portal",
    file,
    sqlite: cachedSqlite,
    tables: schemaTableSpecs(schema, ROW_EXPECTATIONS),
  });
}
