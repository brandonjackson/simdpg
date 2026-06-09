import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, "..", "..");

const dataDir = path.join(serviceRoot, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "social-registry.sqlite");
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
    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL,
      head_citizen_id TEXT NOT NULL,
      pmt_score REAL NOT NULL,
      income_band TEXT NOT NULL CHECK(income_band IN ('low', 'medium', 'high')),
      data_source TEXT NOT NULL DEFAULT 'interview' CHECK(data_source IN ('interview', 'imported', 'recertified')),
      assessed_at TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'superseded')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vulnerability_indicators (
      id TEXT PRIMARY KEY NOT NULL,
      assessment_id TEXT NOT NULL REFERENCES assessments(id),
      indicator TEXT NOT NULL CHECK(indicator IN ('disability', 'elderly', 'single_parent', 'chronic_illness', 'unemployed', 'dependents')),
      value REAL NOT NULL DEFAULT 1,
      weight REAL NOT NULL
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
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assessments_household_id ON assessments(household_id);
    CREATE INDEX IF NOT EXISTS idx_assessments_head_citizen_id ON assessments(head_citizen_id);
    CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments(status);
    CREATE INDEX IF NOT EXISTS idx_vuln_assessment_id ON vulnerability_indicators(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_time ON webhook_events(time);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(type);
    CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_event_type ON webhook_subscriptions(event_type);
  `);
}
