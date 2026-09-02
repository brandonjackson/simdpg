/**
 * `@simdpg/system-kit/db-health` — the database health check on its own.
 *
 * The package's main entry pulls in express (it carries the request middleware
 * and admin routers), which a Next.js route has no business bundling. The
 * portal checks its own database with the same code the systems use, so that
 * code is reachable without the server half.
 */
export { checkDbHealth, dbHealthFailure } from "./db-health.js";
export type {
  CheckDbHealthOptions,
  DbHealthReport,
  DbHealthStatus,
  DbTableSpec,
  RowExpectation,
} from "./db-health.js";
export { schemaTableSpecs } from "./db-schema.js";
export { ensureColumn, tableColumns } from "./migrations.js";
export type { SqliteLike } from "./migrations.js";
