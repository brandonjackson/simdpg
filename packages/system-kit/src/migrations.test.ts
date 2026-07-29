import { describe, it, expect } from "vitest";
import { ensureColumn, tableColumns, type SqliteLike } from "./migrations.js";

/**
 * Stands in for a better-sqlite3 connection: records the SQL it is handed and
 * answers PRAGMA table_info from a fixture, so the migration helper's decision
 * logic is testable without a native dependency.
 */
function fakeSqlite(tables: Record<string, string[]>): SqliteLike & {
  statements: string[];
} {
  const statements: string[] = [];
  return {
    statements,
    prepare(sql: string) {
      const match = /PRAGMA table_info\((\w+)\)/.exec(sql);
      const columns = match ? tables[match[1]] : undefined;
      return {
        all: () => (columns ?? []).map((name) => ({ name })),
      };
    },
    exec(sql: string) {
      statements.push(sql);
      const added = /ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(sql);
      if (added) tables[added[1]] = [...(tables[added[1]] ?? []), added[2]];
      return undefined;
    },
  };
}

describe("tableColumns", () => {
  it("lists a table's columns and returns empty for an unknown table", () => {
    const sqlite = fakeSqlite({ widgets: ["id", "name"] });
    expect(tableColumns(sqlite, "widgets")).toEqual(["id", "name"]);
    expect(tableColumns(sqlite, "missing")).toEqual([]);
  });
});

describe("ensureColumn", () => {
  it("adds a column that a pre-existing table is missing", () => {
    const sqlite = fakeSqlite({ subs: ["id", "event_type"] });

    expect(ensureColumn(sqlite, "subs", "project_id", "TEXT")).toBe(true);
    expect(sqlite.statements).toEqual([
      "ALTER TABLE subs ADD COLUMN project_id TEXT",
    ]);
  });

  it("is a no-op when the column is already there", () => {
    const sqlite = fakeSqlite({ subs: ["id", "project_id"] });

    expect(ensureColumn(sqlite, "subs", "project_id", "TEXT")).toBe(false);
    expect(sqlite.statements).toEqual([]);
  });

  // A fresh database has no table yet — the CREATE TABLE that follows in
  // ensureTables() already declares the column, so there is nothing to alter.
  it("is a no-op when the table doesn't exist yet", () => {
    const sqlite = fakeSqlite({});

    expect(ensureColumn(sqlite, "subs", "project_id", "TEXT")).toBe(false);
    expect(sqlite.statements).toEqual([]);
  });

  it("is safe to run on every startup", () => {
    const sqlite = fakeSqlite({ subs: ["id"] });

    ensureColumn(sqlite, "subs", "project_id", "TEXT");
    ensureColumn(sqlite, "subs", "project_id", "TEXT");

    expect(sqlite.statements).toHaveLength(1);
  });
});
