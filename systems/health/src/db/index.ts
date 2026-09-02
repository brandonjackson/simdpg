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

const dbPath = path.join(dataDir, "health.sqlite");
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
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY NOT NULL,
      citizen_id TEXT NOT NULL,
      blood_type TEXT,
      allergies TEXT,
      registered_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deceased', 'inactive')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY NOT NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      type TEXT NOT NULL CHECK(type IN ('checkup', 'emergency', 'vaccination', 'consultation')),
      date TEXT NOT NULL,
      facility TEXT NOT NULL,
      provider TEXT NOT NULL,
      diagnosis TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'scheduled', 'cancelled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vaccinations (
      id TEXT PRIMARY KEY NOT NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      encounter_id TEXT REFERENCES encounters(id),
      vaccine_name TEXT NOT NULL,
      dose_number INTEGER NOT NULL,
      date_administered TEXT NOT NULL,
      next_dose_due TEXT,
      batch_number TEXT NOT NULL,
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

    CREATE INDEX IF NOT EXISTS idx_patients_citizen_id ON patients(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON encounters(patient_id);
    CREATE INDEX IF NOT EXISTS idx_encounters_type ON encounters(type);
    CREATE INDEX IF NOT EXISTS idx_vaccinations_patient_id ON vaccinations(patient_id);
    CREATE INDEX IF NOT EXISTS idx_vaccinations_encounter_id ON vaccinations(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_vaccinations_vaccine_name ON vaccinations(vaccine_name);
    CREATE INDEX IF NOT EXISTS idx_vaccinations_next_dose_due ON vaccinations(next_dose_due);
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
  patients: "seed",
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
    service: "health",
    file: dbPath,
    sqlite,
    tables: schemaTableSpecs(schema, ROW_EXPECTATIONS),
  });
}
