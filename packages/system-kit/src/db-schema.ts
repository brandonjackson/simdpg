/**
 * Turn a Drizzle schema module into the table specs {@link checkDbHealth}
 * checks the live database against.
 *
 * Deriving the expectation from the schema (rather than repeating a list of
 * table and column names next to it) is the point: the failure being detected
 * *is* schema drift, so the expectation has to move with the code. Add a column
 * to a schema file and the health check starts requiring it in the database
 * that same commit — which is precisely when a deployed volume that never got
 * the column starts lying to you.
 */
import { is } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import type { DbTableSpec, RowExpectation } from "./db-health.js";

/**
 * Every table declared in `schema`, with the columns this build selects.
 *
 * `expectRows` maps a table name to whether it should hold rows — see
 * {@link RowExpectation}. Tables left out of it may legitimately be empty.
 */
export function schemaTableSpecs(
  schema: Record<string, unknown>,
  expectRows: Record<string, RowExpectation> = {},
): DbTableSpec[] {
  const specs: DbTableSpec[] = [];

  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) continue;
    const config = getTableConfig(value);
    specs.push({
      name: config.name,
      columns: config.columns.map((column) => column.name),
      ...(expectRows[config.name] ? { expectRows: expectRows[config.name] } : {}),
    });
  }

  return specs.sort((a, b) => a.name.localeCompare(b.name));
}
