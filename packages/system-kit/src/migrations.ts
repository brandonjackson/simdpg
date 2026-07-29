/**
 * Small, dependency-free schema migrations for the systems' SQLite databases.
 *
 * Every system bootstraps its tables with `CREATE TABLE IF NOT EXISTS`, which is
 * enough for a fresh volume but silently does nothing when a table already
 * exists — so a *new column* never reaches a database created by an earlier
 * release. {@link ensureColumn} closes that gap: it adds the column when it's
 * missing and does nothing when it isn't, so `ensureTables()` stays safe to run
 * on every startup.
 *
 * Typed against a minimal structural interface rather than better-sqlite3 so
 * system-kit doesn't take on a native dependency for four lines of SQL.
 */

export interface SqliteLike {
  prepare(sql: string): { all(): unknown[] };
  exec(sql: string): unknown;
}

/** Column names of a table; empty when the table doesn't exist. */
export function tableColumns(sqlite: SqliteLike, table: string): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
    name?: string;
  }[];
  return rows.map((row) => row.name).filter((name): name is string => !!name);
}

/**
 * Add `column` to `table` if it isn't there yet. `definition` is the column's
 * SQL type and constraints, e.g. `"TEXT"` or `"INTEGER NOT NULL DEFAULT 0"` —
 * SQLite's ALTER TABLE ADD COLUMN requires it to be nullable or defaulted.
 * Returns true when the column was added.
 */
export function ensureColumn(
  sqlite: SqliteLike,
  table: string,
  column: string,
  definition: string,
): boolean {
  const columns = tableColumns(sqlite, table);
  // No table yet: the CREATE TABLE that follows will include the column.
  if (columns.length === 0 || columns.includes(column)) return false;

  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}
