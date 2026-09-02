import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDbHealth, type DbTableSpec } from "./db-health.js";
import { schemaTableSpecs } from "./db-schema.js";

/**
 * The health check exists to catch a *real* database in a broken state, so the
 * tests use one: a throwaway SQLite file per case, bootstrapped the way a
 * service does and then damaged in the ways a deployment damages it.
 */
let dir: string;
let file: string;
let sqlite: Database.Database;

const TABLES: DbTableSpec[] = [
  { name: "citizens", columns: ["id", "national_id", "status"], expectRows: "seed" },
  { name: "programs", columns: ["id", "name"], expectRows: "always" },
  { name: "webhook_events", columns: ["id", "type"] },
];

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE citizens (id TEXT PRIMARY KEY, national_id TEXT, status TEXT);
    CREATE TABLE programs (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE webhook_events (id TEXT PRIMARY KEY, type TEXT);
    INSERT INTO citizens VALUES ('c1', 'SIM-000001', 'alive');
    INSERT INTO programs VALUES ('p1', 'Child Benefit');
  `);
}

function check() {
  return checkDbHealth({ service: "identity", file, sqlite, tables: TABLES });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "simdpg-db-health-"));
  file = join(dir, "identity.sqlite");
  sqlite = new Database(file);
  createSchema(sqlite);
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    /* already closed by a test */
  }
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

describe("checkDbHealth", () => {
  it("reports a healthy database", () => {
    const report = check();
    expect(report.status).toBe("ok");
    expect(report.problems).toEqual([]);
    expect(report.writable).toBe(true);
    expect(report.counts).toEqual({ citizens: 1, programs: 1 });
  });

  it("reports a missing table", () => {
    sqlite.exec("DROP TABLE citizens");
    const report = check();
    expect(report.status).toBe("error");
    expect(report.missingTables).toEqual(["citizens"]);
    expect(report.problems.join(" ")).toContain("citizens");
  });

  it("reports a column the deployed schema never picked up", () => {
    sqlite.exec("ALTER TABLE citizens DROP COLUMN status");
    const report = check();
    expect(report.status).toBe("error");
    expect(report.missingColumns).toEqual(["citizens.status"]);
    expect(report.problems.join(" ")).toContain("predates this build's schema");
  });

  it("reports reference data that has gone missing", () => {
    sqlite.exec("DELETE FROM programs");
    const report = check();
    expect(report.status).toBe("error");
    expect(report.problems.join(" ")).toContain("re-created on every start");
  });

  it("reports an empty database as empty, not broken", () => {
    sqlite.exec("DELETE FROM citizens");
    const report = check();
    expect(report.status).toBe("empty");
    expect(report.problems.join(" ")).toContain("No data");
  });

  it("reports a database it cannot query", () => {
    sqlite.close();
    const report = check();
    expect(report.status).toBe("error");
    expect(report.problems.join(" ")).toContain("can't be queried");
  });

  it("reports a read-only volume, where reads still work", () => {
    // Root ignores the permission bits, so this can only be exercised as a
    // normal user — skip rather than assert something untrue.
    if (typeof process.getuid === "function" && process.getuid() === 0) return;
    chmodSync(dir, 0o555);
    const report = check();
    expect(report.status).toBe("error");
    expect(report.writable).toBe(false);
    expect(report.problems.join(" ")).toContain("not writable");
  });
});

describe("schemaTableSpecs", () => {
  it("derives table and column names from a Drizzle schema", async () => {
    const { sqliteTable, text, integer } = await import("drizzle-orm/sqlite-core");
    const schema = {
      citizens: sqliteTable("citizens", {
        id: text("id").primaryKey(),
        nationalId: text("national_id").notNull(),
      }),
      programs: sqliteTable("programs", {
        id: text("id").primaryKey(),
        active: integer("is_active"),
      }),
      // Non-table exports (types, helpers) are ignored.
      NOT_A_TABLE: "ignore me",
    };

    expect(schemaTableSpecs(schema, { programs: "always" })).toEqual([
      { name: "citizens", columns: ["id", "national_id"] },
      { name: "programs", columns: ["id", "is_active"], expectRows: "always" },
    ]);
  });
});
