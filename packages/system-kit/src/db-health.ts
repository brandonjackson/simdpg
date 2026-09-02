/**
 * Database health checks — the loud half of "the migration didn't run and
 * nothing said so".
 *
 * Every SimDPG service keeps its data in a SQLite file on a mounted volume and
 * bootstraps its schema at startup with `CREATE TABLE IF NOT EXISTS` (plus
 * {@link ensureColumn} for later columns). That is quiet by design: if the
 * volume is missing, mounted read-only, pointed at the wrong path, or the
 * schema never picked up a new column, the service still boots, `/admin/stats`
 * still answers, and the portal cheerfully renders a population of 0. Nothing
 * throws, so nothing is reported.
 *
 * {@link checkDbHealth} makes that state observable: it asks the live database
 * the questions the app's queries assume the answer to — can I read you, are
 * your tables there, do they have the columns this build selects, can I write
 * to your file, and do the tables that should never be empty hold rows — and
 * returns a report the portal turns into a banner with the command to run.
 *
 * Structurally typed against {@link SqliteLike} (same as `migrations.ts`) so
 * system-kit doesn't take on a native dependency.
 */
import { accessSync, constants, existsSync } from "node:fs";
import { dirname } from "node:path";
import { tableColumns, type SqliteLike } from "./migrations.js";

/**
 * Whether a table is expected to hold rows in a healthy deployment.
 *
 * - `"always"` — reference data re-created on every server start (benefit
 *   programmes, the default project). Zero rows means a write that should have
 *   happened at boot didn't stick: a genuine failure.
 * - `"seed"` — population data written once by the seed script. Staff can
 *   delete it on purpose, so zero rows is only worth reporting when *every*
 *   seeded table is empty — the signature of a seed that never ran.
 */
export type RowExpectation = "always" | "seed";

/** A table the service's queries require, and what it should contain. */
export interface DbTableSpec {
  /** Table name as `ensureTables()` creates it. */
  name: string;
  /** Columns this build's queries select. Missing ones = un-applied migration. */
  columns: string[];
  /** Whether the table should hold rows. Omit for tables that may be empty. */
  expectRows?: RowExpectation;
}

/**
 * `"ok"` — usable. `"empty"` — usable but holds no seeded data (counters will
 * read zero). `"error"` — broken: unreadable, unwritable, or missing schema.
 */
export type DbHealthStatus = "ok" | "empty" | "error";

export interface DbHealthReport {
  /** Service the database belongs to, e.g. `"identity"`. */
  service: string;
  status: DbHealthStatus;
  /** Absolute path of the SQLite file, so a wrong volume mount is visible. */
  file: string;
  /** False when the file (or its directory) can't be written to. */
  writable: boolean;
  checkedAt: string;
  /** Human-readable problems, worst first. Empty when the status is `"ok"`. */
  problems: string[];
  /** Tables the schema is missing entirely. */
  missingTables: string[];
  /** Columns missing from tables that do exist, as `table.column`. */
  missingColumns: string[];
  /** Row counts for the tables that carry a row expectation. */
  counts: Record<string, number>;
}

/**
 * A report for a database that couldn't be checked at all — the connection
 * failed to open, or the service holding it didn't answer. Callers that never
 * reach {@link checkDbHealth} still have to say *something* specific, and a
 * missing report reads as "fine" in a UI.
 */
export function dbHealthFailure(
  service: string,
  file: string,
  problem: string,
): DbHealthReport {
  return {
    service,
    status: "error",
    file,
    writable: false,
    checkedAt: new Date().toISOString(),
    problems: [problem],
    missingTables: [],
    missingColumns: [],
    counts: {},
  };
}

export interface CheckDbHealthOptions {
  service: string;
  /** Path of the SQLite file, used for the writability check and the report. */
  file: string;
  sqlite: SqliteLike;
  tables: DbTableSpec[];
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Rows in `table`, or null when the count itself fails. */
function countRows(sqlite: SqliteLike, table: string): number | null {
  try {
    const rows = sqlite.prepare(`SELECT count(*) AS c FROM "${table}"`).all() as {
      c?: number;
    }[];
    return rows[0]?.c ?? 0;
  } catch {
    return null;
  }
}

/**
 * Can the service write to its database? SQLite in WAL mode writes the `-wal`
 * and `-shm` sidecars next to the file, so the *directory* has to be writable
 * too — a read-only volume mount fails here while reads keep working, which is
 * exactly the failure that looks like nothing at all.
 */
function isWritable(file: string): boolean {
  try {
    accessSync(dirname(file), constants.W_OK);
    if (existsSync(file)) accessSync(file, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspect a live SQLite database and report whether the service can actually
 * rely on it. Never throws: a database too broken to answer is the thing being
 * reported, so every failure comes back in the report.
 */
export function checkDbHealth(options: CheckDbHealthOptions): DbHealthReport {
  const { service, file, sqlite, tables } = options;

  const report: DbHealthReport = {
    service,
    status: "ok",
    file,
    writable: true,
    checkedAt: new Date().toISOString(),
    problems: [],
    missingTables: [],
    missingColumns: [],
    counts: {},
  };

  // 1. Is there a database to talk to at all?
  try {
    sqlite.prepare("SELECT 1").all();
  } catch (err) {
    report.status = "error";
    report.writable = false;
    report.problems.push(`The database can't be queried: ${message(err)}`);
    return report; // Nothing below can mean anything if this failed.
  }

  if (!existsSync(file)) {
    report.status = "error";
    report.problems.push(
      `The database file ${file} is missing — the service is writing somewhere else, or the volume isn't mounted.`,
    );
  }

  // 2. Is the schema the one this build's queries were written against?
  for (const table of tables) {
    let columns: string[];
    try {
      columns = tableColumns(sqlite, table.name);
    } catch (err) {
      report.status = "error";
      report.problems.push(
        `Table "${table.name}" could not be inspected: ${message(err)}`,
      );
      continue;
    }

    if (columns.length === 0) {
      report.missingTables.push(table.name);
      continue;
    }

    for (const column of table.columns) {
      if (!columns.includes(column)) {
        report.missingColumns.push(`${table.name}.${column}`);
      }
    }
  }

  if (report.missingTables.length > 0) {
    report.status = "error";
    report.problems.push(
      `Missing ${report.missingTables.length === 1 ? "table" : "tables"}: ${report.missingTables.join(", ")}.`,
    );
  }
  if (report.missingColumns.length > 0) {
    report.status = "error";
    report.problems.push(
      `Missing ${report.missingColumns.length === 1 ? "column" : "columns"}: ${report.missingColumns.join(", ")}. The database predates this build's schema.`,
    );
  }

  // 3. Can it be written to? Reads keep working on a read-only volume, so this
  //    is the check that catches "everything looks fine until you save".
  report.writable = isWritable(file);
  if (!report.writable) {
    report.status = "error";
    report.problems.push(
      `The database file is not writable — reads work, every write will fail.`,
    );
  }

  // 4. Do the tables that should hold rows hold rows?
  const seedTables: string[] = [];
  let seedRows = 0;

  for (const table of tables) {
    if (!table.expectRows) continue;
    if (report.missingTables.includes(table.name)) continue;

    const count = countRows(sqlite, table.name);
    if (count === null) {
      report.status = "error";
      report.problems.push(`Table "${table.name}" could not be counted.`);
      continue;
    }
    report.counts[table.name] = count;

    if (table.expectRows === "always" && count === 0) {
      report.status = "error";
      report.problems.push(
        `Table "${table.name}" is empty, but it holds reference data that is re-created on every start — the write isn't reaching the database.`,
      );
    }
    if (table.expectRows === "seed") {
      seedTables.push(table.name);
      seedRows += count;
    }
  }

  if (seedTables.length > 0 && seedRows === 0 && report.status === "ok") {
    report.status = "empty";
    report.problems.push(
      `No data: ${seedTables.join(", ")} ${seedTables.length === 1 ? "is" : "are"} empty. Either the seed never ran or the data was deleted.`,
    );
  }

  return report;
}
