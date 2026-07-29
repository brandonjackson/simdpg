import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ensureColumn } from "@simdpg/system-kit";
import * as schema from "./schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, "..", "..");

const dataDir = path.join(serviceRoot, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "civil-registry.sqlite");
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
    CREATE TABLE IF NOT EXISTS birth_registrations (
      id TEXT PRIMARY KEY NOT NULL,
      child_citizen_id TEXT NOT NULL,
      mother_citizen_id TEXT NOT NULL,
      father_citizen_id TEXT,
      date_of_birth TEXT NOT NULL,
      place_of_birth TEXT NOT NULL,
      registration_date TEXT NOT NULL,
      registrar_notes TEXT,
      status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered', 'amended', 'cancelled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS death_registrations (
      id TEXT PRIMARY KEY NOT NULL,
      citizen_id TEXT NOT NULL,
      date_of_death TEXT NOT NULL,
      place_of_death TEXT NOT NULL,
      cause_of_death TEXT,
      registration_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered', 'amended', 'cancelled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS marriage_registrations (
      id TEXT PRIMARY KEY NOT NULL,
      spouse_1_citizen_id TEXT NOT NULL,
      spouse_2_citizen_id TEXT NOT NULL,
      date_of_marriage TEXT NOT NULL,
      place_of_marriage TEXT NOT NULL,
      registration_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered', 'divorced', 'annulled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

    CREATE INDEX IF NOT EXISTS idx_births_child_citizen_id ON birth_registrations(child_citizen_id);
    CREATE INDEX IF NOT EXISTS idx_births_mother_citizen_id ON birth_registrations(mother_citizen_id);
    CREATE INDEX IF NOT EXISTS idx_births_father_citizen_id ON birth_registrations(father_citizen_id);
    CREATE INDEX IF NOT EXISTS idx_deaths_citizen_id ON death_registrations(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_marriages_spouse_1 ON marriage_registrations(spouse_1_citizen_id);
    CREATE INDEX IF NOT EXISTS idx_marriages_spouse_2 ON marriage_registrations(spouse_2_citizen_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_time ON webhook_events(time);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(type);
    CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_event_type ON webhook_subscriptions(event_type);
  `);

  // Databases created before webhook registrations were grouped into projects
  // already have a webhook_subscriptions table, so the CREATE above is a no-op
  // for them and the new column has to be added explicitly.
  ensureColumn(sqlite, "webhook_subscriptions", "project_id", "TEXT");
}
