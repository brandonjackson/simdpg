import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ROOT = resolve(__dirname, "../..");
const DB_PATH = resolve(SERVICE_ROOT, "data", "identity.sqlite");

// Ensure data directory exists
const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

/**
 * Create all tables if they don't already exist.
 * Uses IF NOT EXISTS so it's safe to call on every startup.
 */
export function ensureTables(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS citizens (
      id              TEXT PRIMARY KEY,
      national_id     TEXT NOT NULL UNIQUE,
      given_name      TEXT NOT NULL,
      family_name     TEXT NOT NULL,
      date_of_birth   TEXT NOT NULL,
      sex             TEXT NOT NULL CHECK(sex IN ('male', 'female')),
      email           TEXT,
      phone_number    TEXT,
      date_of_death   TEXT,
      status          TEXT NOT NULL DEFAULT 'alive' CHECK(status IN ('alive', 'deceased')),
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id          TEXT PRIMARY KEY,
      citizen_id  TEXT NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
      type        TEXT NOT NULL CHECK(type IN ('residential', 'mailing')),
      line_1      TEXT NOT NULL,
      line_2      TEXT,
      city        TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      from_date   TEXT NOT NULL,
      to_date     TEXT
    );

    CREATE TABLE IF NOT EXISTS household_members (
      id              TEXT PRIMARY KEY,
      household_id    TEXT NOT NULL,
      citizen_id      TEXT NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
      relationship    TEXT NOT NULL CHECK(relationship IN ('head', 'spouse', 'child', 'other')),
      from_date       TEXT NOT NULL,
      to_date         TEXT
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

    CREATE INDEX IF NOT EXISTS idx_citizens_national_id ON citizens(national_id);
    CREATE INDEX IF NOT EXISTS idx_addresses_citizen_id ON addresses(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_household_members_household_id ON household_members(household_id);
    CREATE INDEX IF NOT EXISTS idx_household_members_citizen_id ON household_members(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_time ON webhook_events(time);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(type);
    CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_event_type ON webhook_subscriptions(event_type);
  `);
}
