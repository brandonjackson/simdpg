import { SYSTEM_URLS } from "@simdpg/api-clients";
import type { DbHealthReport } from "@simdpg/system-kit/db-health";
import { checkPortalDatabase } from "./db/index";

/**
 * Whole-deployment database health: the portal's own database plus every
 * system's, with the command that fixes each problem.
 *
 * This exists because the failure it reports is silent. Each service creates
 * its tables at startup and keeps its data on a mounted volume; when the volume
 * isn't there, is mounted read-only, or the schema predates the running build,
 * nothing throws — the systems answer `/admin/stats` with zeroes and the portal
 * renders a population of 0 with no error anywhere. The only way to notice was
 * to know what the number should have been.
 *
 * So the portal asks every service the direct question ("is your database
 * usable?"), and the answer drives a banner on every page rather than a log
 * line nobody reads.
 */

/** Per-service state. `unreachable` means we couldn't even ask. */
export type ServiceStatus = "ok" | "empty" | "error" | "unreachable";

/** How loudly a service's state should be reported. */
export type Severity = "ok" | "warning" | "error";

/** Overall state of the deployment's databases. */
export type OverallStatus = "ok" | "warning" | "error";

export interface ServiceDbHealth {
  /** Workspace slug: `portal`, `identity`, `civil-registry`, … */
  key: string;
  label: string;
  /** npm workspace, which is also the Railway service name. */
  workspace: string;
  status: ServiceStatus;
  severity: Severity;
  /** What is wrong, in plain words. Empty when the service is healthy. */
  problems: string[];
  /** Commands to run in this service's console, in order. */
  commands: string[];
  /** Fixes that aren't a command — volume mounts, redeploys. */
  hints: string[];
  /** Path of the database file, so a wrong volume mount is obvious. */
  file?: string;
}

export interface DatabaseHealth {
  status: OverallStatus;
  checkedAt: string;
  services: ServiceDbHealth[];
}

export interface ServiceDescriptor {
  key: string;
  label: string;
  workspace: string;
  /** Where its volume has to be mounted for the data to survive a redeploy. */
  volume: string;
  /** Base URL, for the systems the portal has to ask over HTTP. */
  url?: string;
  /** Command that rebuilds the schema (and seeds, where there is a seed). */
  repair: string;
}

const PORTAL: ServiceDescriptor = {
  key: "portal",
  label: "Portal",
  workspace: "@simdpg/portal",
  volume: "/app/portal/data",
  repair: "npm run db:setup -w @simdpg/portal",
};

const SYSTEMS: ServiceDescriptor[] = [
  { key: "identity", label: "Identity", url: SYSTEM_URLS.identity },
  { key: "civil-registry", label: "Civil Registry", url: SYSTEM_URLS.civilRegistry },
  { key: "health", label: "Health", url: SYSTEM_URLS.health },
  { key: "benefits", label: "Benefits", url: SYSTEM_URLS.benefits },
  { key: "notifications", label: "Notifications", url: SYSTEM_URLS.notifications },
  { key: "payments", label: "Payments", url: SYSTEM_URLS.payments },
  { key: "social-registry", label: "Social Registry", url: SYSTEM_URLS.socialRegistry },
].map((system) => ({
  ...system,
  workspace: `@simdpg/${system.key}`,
  volume: `/app/systems/${system.key}/data`,
  // The seed script runs the schema bootstrap first and only then inserts, and
  // it skips a database that already holds data — so it repairs a missing
  // table and fills an empty one, and is safe to run when neither is true.
  repair: `npm run db:seed -w @simdpg/${system.key}`,
}));

/** How long a system gets to answer before it counts as unreachable. */
const TIMEOUT_MS = 5000;

/** A first failure is often a service still coming up, so ask twice. */
const RETRY_DELAY_MS = 750;

/**
 * Why a system's report couldn't be read, ready to show. `severity` separates
 * "this service is down" (red — its data is missing from every page) from
 * "this service is running a build that has no health check" (amber — its
 * database might be perfectly fine, we just can't tell).
 */
interface UnreadableReport {
  severity: Exclude<Severity, "ok">;
  problem: string;
  hint: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ask one system for its database report, or describe why we couldn't.
 * Tries twice: the portal and the systems restart together on a redeploy, and
 * a single refused connection during those few seconds isn't news.
 */
async function fetchReport(
  descriptor: ServiceDescriptor,
): Promise<DbHealthReport | UnreadableReport> {
  let failure: UnreadableReport = {
    severity: "error",
    problem: `The ${descriptor.label} service didn't answer.`,
    hint: `Check the service is deployed and running (Railway → ${descriptor.workspace} → Deployments).`,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAY_MS);
    try {
      const res = await fetch(`${descriptor.url}/admin/db-health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) return (await res.json()) as DbHealthReport;

      failure =
        res.status === 404
          ? {
              severity: "warning",
              problem: `The ${descriptor.label} service is running an older build with no database health check, so the state of its database can't be confirmed.`,
              hint: `Redeploy ${descriptor.workspace} to pick up this build.`,
            }
          : {
              severity: "error",
              problem: `The ${descriptor.label} service answered HTTP ${res.status} when asked about its database.`,
              hint: `Check the service's logs (Railway → ${descriptor.workspace} → Deployments).`,
            };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failure = {
        severity: "error",
        problem: `The ${descriptor.label} service didn't answer (${reason}), so its records can't be read — everything it should show reads as empty.`,
        hint: `Check the service is deployed and running (Railway → ${descriptor.workspace} → Deployments).`,
      };
    }
  }

  return failure;
}

/** The commands and manual steps that fix what `report` describes. */
function fixesFor(
  descriptor: ServiceDescriptor,
  report: DbHealthReport,
): Pick<ServiceDbHealth, "commands" | "hints"> {
  const commands: string[] = [];
  const hints: string[] = [];

  if (!report.writable) {
    // Nothing worth running until the file can be written to: every command
    // below would fail the same way.
    hints.push(
      `The database file isn't writable. Mount a volume at ${descriptor.volume} ` +
        `(Railway → ${descriptor.workspace} → Settings → Volumes) and redeploy, ` +
        `then run the command above.`,
    );
  }

  commands.push(descriptor.repair);

  if (report.missingColumns.length > 0) {
    hints.push(
      "The database was created by an older build. The command above re-runs " +
        "the schema bootstrap; if the columns are still missing afterwards, " +
        "this build has no migration for them and one needs adding " +
        "(ensureColumn in the service's db/index.ts).",
    );
  }

  return { commands, hints };
}

/** Turn one service's report (or its absence) into what the banner shows. */
export function toServiceHealth(
  descriptor: ServiceDescriptor,
  report: DbHealthReport | UnreadableReport,
): ServiceDbHealth {
  const base = {
    key: descriptor.key,
    label: descriptor.label,
    workspace: descriptor.workspace,
  };

  if ("problem" in report) {
    return {
      ...base,
      status: "unreachable",
      severity: report.severity,
      problems: [report.problem],
      commands: [],
      hints: [report.hint],
    };
  }

  if (report.status === "ok") {
    return {
      ...base,
      status: "ok",
      severity: "ok",
      problems: [],
      commands: [],
      hints: [],
      file: report.file,
    };
  }

  return {
    ...base,
    status: report.status,
    severity: report.status === "error" ? "error" : "warning",
    problems: report.problems,
    file: report.file,
    ...fixesFor(descriptor, report),
  };
}

/**
 * Overall state.
 *
 * Anything broken or unreachable is an error. A service we couldn't verify is a
 * warning. An *empty* database is only raised when every system is empty: one
 * empty system among populated ones is usually deliberate (staff delete a
 * population all the time), whereas nothing anywhere is the signature of a seed
 * that never ran — which is exactly how this failure shows up.
 */
export function summarize(services: ServiceDbHealth[]): OverallStatus {
  if (services.some((service) => service.severity === "error")) return "error";

  if (
    services.some(
      (service) => service.severity === "warning" && service.status !== "empty",
    )
  ) {
    return "warning";
  }

  const systems = services.filter((service) => service.key !== "portal");
  const empty = systems.filter((service) => service.status === "empty");
  const populated = systems.filter((service) => service.status === "ok");
  if (empty.length > 0 && populated.length === 0) return "warning";

  return "ok";
}

/** Check the portal's database and every system's, in parallel. */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const [portal, ...systems] = await Promise.all([
    Promise.resolve(toServiceHealth(PORTAL, checkPortalDatabase())),
    ...SYSTEMS.map(async (descriptor) =>
      toServiceHealth(descriptor, await fetchReport(descriptor)),
    ),
  ]);

  const services = [portal, ...systems];

  return {
    status: summarize(services),
    checkedAt: new Date().toISOString(),
    services,
  };
}
