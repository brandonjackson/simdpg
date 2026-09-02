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

const dbPath = path.join(dataDir, "notifications.sqlite");
const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function ensureTables(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id              TEXT PRIMARY KEY NOT NULL,
      citizen_id      TEXT NOT NULL,
      channel         TEXT NOT NULL CHECK(channel IN ('email', 'sms')),
      destination     TEXT NOT NULL,
      subject         TEXT,
      body            TEXT NOT NULL,
      source_system   TEXT NOT NULL,
      source_event    TEXT,
      status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'delivered', 'failed')),
      attempts        INTEGER NOT NULL DEFAULT 0,
      sent_at         TEXT,
      delivered_at    TEXT,
      failed_reason   TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
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

    CREATE INDEX IF NOT EXISTS idx_notifications_citizen_id ON notifications(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_source_system ON notifications(source_system);
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
  notifications: "seed",
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
    service: "notifications",
    file: dbPath,
    sqlite,
    tables: schemaTableSpecs(schema, ROW_EXPECTATIONS),
  });
}
