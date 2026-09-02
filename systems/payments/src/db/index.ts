import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  checkDbHealth,
  ensureColumn,
  schemaTableSpecs,
  type DbHealthReport,
} from "@simdpg/system-kit";
import * as schema from "./schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, "..", "..");

const dataDir = path.join(serviceRoot, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "payments.sqlite");
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

/**
 * Create tables if they do not already exist.
 * Called on startup — avoids the need for drizzle-kit migrations.
 */
export function ensureTables(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id          TEXT PRIMARY KEY NOT NULL,
      owner_type  TEXT NOT NULL CHECK(owner_type IN ('treasury', 'citizen')),
      owner_id    TEXT NOT NULL UNIQUE,
      balance     REAL NOT NULL DEFAULT 0,
      currency    TEXT NOT NULL DEFAULT 'SIM',
      status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id               TEXT PRIMARY KEY NOT NULL,
      idempotency_key  TEXT NOT NULL UNIQUE,
      from_account_id  TEXT REFERENCES accounts(id),
      to_account_id    TEXT REFERENCES accounts(id),
      amount           REAL NOT NULL,
      currency         TEXT NOT NULL DEFAULT 'SIM',
      enrollment_id    TEXT,
      reference        TEXT,
      status           TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
      failure_code     TEXT,
      failure_message  TEXT,
      created_at       TEXT NOT NULL,
      completed_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id          TEXT PRIMARY KEY NOT NULL,
      payment_id  TEXT NOT NULL REFERENCES payments(id),
      account_id  TEXT NOT NULL REFERENCES accounts(id),
      direction   TEXT NOT NULL CHECK(direction IN ('debit', 'credit')),
      amount      REAL NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'SIM',
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      source      TEXT NOT NULL,
      time        TEXT NOT NULL,
      data        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      error       TEXT
    );

    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id          TEXT PRIMARY KEY,
      event_type  TEXT NOT NULL,
      target_url  TEXT NOT NULL,
      project_id  TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_owner_id ON accounts(owner_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_owner_type ON accounts(owner_type);
    CREATE INDEX IF NOT EXISTS idx_payments_to_account ON payments(to_account_id);
    CREATE INDEX IF NOT EXISTS idx_payments_enrollment_id ON payments(enrollment_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_ledger_payment_id ON ledger_entries(payment_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_account_id ON ledger_entries(account_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_time ON webhook_events(time);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(type);
    CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_event_type ON webhook_subscriptions(event_type);
  `);

  // Databases created before webhook registrations were grouped into projects
  // already have a webhook_subscriptions table, so the CREATE above is a no-op
  // for them and the new column has to be added explicitly.
  ensureColumn(sqlite, "webhook_subscriptions", "project_id", "TEXT");
}

/**
 * What each table should contain in a working deployment, for the health
 * check below. Everything else may legitimately be empty.
 */
const ROW_EXPECTATIONS = {
  accounts: "population",
} as const;

/**
 * Report on the live database — schema, writability, and whether the tables
 * that should hold rows do. Served by `GET /admin/db-health` and summarised in
 * `/health`; the portal polls every system and raises a banner when one of
 * these reports comes back unhealthy, because otherwise a database that never
 * got its tables (or a volume mounted read-only) just shows up as zeroes.
 */
export function checkDatabase(): DbHealthReport {
  return checkDbHealth({
    service: "payments",
    file: dbPath,
    sqlite,
    tables: schemaTableSpecs(schema, ROW_EXPECTATIONS),
  });
}
