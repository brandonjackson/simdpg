/**
 * Create or repair the portal's database, then report on its state.
 *
 * This is the command the site's database banner tells you to run. It opens
 * the database the portal itself would open — same path, same bootstrap — so
 * it creates the tables a fresh (or newly mounted) volume is missing, applies
 * the in-code migrations, and re-inserts the default project. Then it checks
 * the result and says what, if anything, is still wrong.
 *
 * Run it from the portal service's console:
 *
 *   npm run db:setup -w @simdpg/portal
 *
 * Safe to run any number of times: everything it does is idempotent, and it
 * never deletes data.
 */
import { checkPortalDatabase, getDb } from "../src/lib/db/index";
import { simDbPath } from "../src/lib/simulations/paths";

console.log(`Portal database: ${simDbPath()}`);

try {
  getDb();
  console.log("Schema bootstrapped (tables created if they were missing).");
} catch (err) {
  console.error(
    `Could not open the database: ${err instanceof Error ? err.message : String(err)}`,
  );
  console.error(
    "Check that a volume is mounted at /app/portal/data (or that PORTAL_DB_FILE points somewhere writable).",
  );
  process.exit(1);
}

const report = checkPortalDatabase();

for (const [table, count] of Object.entries(report.counts)) {
  console.log(`  ${table}: ${count} row(s)`);
}

if (report.status === "ok") {
  console.log("Database is healthy.");
  process.exit(0);
}

console.error(`Database status: ${report.status}`);
for (const problem of report.problems) {
  console.error(`  - ${problem}`);
}
process.exit(report.status === "error" ? 1 : 0);
