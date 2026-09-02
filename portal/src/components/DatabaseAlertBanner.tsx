"use client";

import { useCallback, useEffect, useState } from "react";
import type { DatabaseHealth, ServiceDbHealth } from "@/lib/db-health";

/**
 * Site-wide banner for a database that isn't working — and, separately, for a
 * deployment that has no population in it yet.
 *
 * Both look identical from a page: counters read 0 and lists come back empty.
 * They need opposite responses, though. A broken database (no tables, an
 * unwritable volume, a schema older than the build) is a fault, and the fix is
 * a command in that service's Railway console. An empty one is not a fault at
 * all — the systems are working, nobody has generated a population — and the
 * fix is the staff population page. Telling someone to re-seed a database that
 * is doing its job perfectly well sends them after a bug that isn't there, so
 * the two states are worded and coloured differently.
 */

/** How often to re-check while a page is open. */
const POLL_MS = 60_000;

/**
 * Where to send someone whose systems are fine but empty. Declared here rather
 * than imported from `@/lib/db-health`: that module opens the portal's
 * database, so only its *types* may cross into a client component — importing
 * a value from it drags better-sqlite3 into the browser bundle.
 */
const POPULATION_PAGE = "/staff/population";

/**
 * Services that are down all at once — a private network that isn't up, say —
 * otherwise fill the banner with identical paragraphs and bury the one service
 * that is genuinely broken. Past this many, they collapse into one entry.
 */
const GROUP_FROM = 3;

const STATUS_LABELS: Record<ServiceDbHealth["status"], string> = {
  ok: "OK",
  empty: "No population",
  error: "Broken",
  unreachable: "Not answering",
};

const CONSOLE_PATH = "open the service → ⋮ → Console";

/** "Identity, Health and Benefits" — for reading, not for parsing. */
function nameList(services: ServiceDbHealth[]): string {
  const labels = services.map((service) => service.label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function heading(services: ServiceDbHealth[]): string {
  return services.length === 1 ? services[0].label : `${services.length} systems`;
}

function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked (insecure origin, permissions policy).
      // The command is on screen either way, so there is nothing to recover.
    }
  }

  return (
    <div className="db-alert__command">
      <code>{command}</code>
      <button type="button" onClick={copy} className="db-alert__copy">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** One broken service, with what's wrong and the command that fixes it. */
function ServiceProblem({ service }: { service: ServiceDbHealth }) {
  return (
    <li className="db-alert__service">
      <p className="db-alert__service-name">
        {service.label}
        <span className="db-alert__tag">{STATUS_LABELS[service.status]}</span>
      </p>

      {service.problems.map((problem, i) => (
        <p key={i} className="db-alert__problem">
          {problem}
        </p>
      ))}

      {service.commands.length > 0 && (
        <>
          <p className="db-alert__fix">
            Fix it from the <code>{service.workspace}</code> service in Railway (
            {CONSOLE_PATH}) and run:
          </p>
          {service.commands.map((command) => (
            <CommandLine key={command} command={command} />
          ))}
        </>
      )}

      {service.hints.map((hint, i) => (
        <p key={i} className="db-alert__hint">
          {hint}
        </p>
      ))}

      {service.file && (
        <p className="db-alert__hint">
          Database file: <code>{service.file}</code>
        </p>
      )}
    </li>
  );
}

/** Several services that didn't answer, said once. */
function SilentServices({ services }: { services: ServiceDbHealth[] }) {
  return (
    <li className="db-alert__service">
      <p className="db-alert__service-name">
        {heading(services)}
        <span className="db-alert__tag">{STATUS_LABELS.unreachable}</span>
      </p>
      <p className="db-alert__problem">
        {nameList(services)} didn&apos;t answer, so nothing they hold can be
        read.
      </p>
      <p className="db-alert__hint">
        Check the services are deployed and running (Railway &rarr; each service
        &rarr; Deployments). If they are, the portal can&apos;t reach them over
        the private network.
      </p>
    </li>
  );
}

/**
 * Nothing is wrong here: the databases work, they just have no citizens in
 * them. So this points at the page that makes some, and never at a console.
 */
function NoPopulation({ services }: { services: ServiceDbHealth[] }) {
  return (
    <li className="db-alert__service">
      <p className="db-alert__service-name">
        {heading(services)}
        <span className="db-alert__tag">{STATUS_LABELS.empty}</span>
      </p>

      <p className="db-alert__problem">
        {nameList(services)} {services.length === 1 ? "is" : "are"} running
        normally — the {services.length === 1 ? "database is" : "databases are"}{" "}
        working, {services.length === 1 ? "it holds" : "they hold"} no citizen
        records. Until a population exists, every counter reads 0 and every
        search comes back empty.
      </p>

      <p className="db-alert__fix">
        Generate one in Population management: choose the size and shape you
        want, then press <strong>Generate population</strong>.
      </p>

      <p>
        <a className="db-alert__action" href={POPULATION_PAGE}>
          Go to population management
        </a>
      </p>

      <p className="db-alert__hint">
        A handful of sample records can also be restored from a service&apos;s
        console (<code>npm run db:seed -w @simdpg/identity</code>, once per
        system), but generating a population is the usual route.
      </p>
    </li>
  );
}

export default function DatabaseAlertBanner() {
  const [health, setHealth] = useState<DatabaseHealth | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      // A broken deployment answers 503 here, so the body is what matters, not
      // the status code.
      const res = await fetch("/api/health/database", { cache: "no-store" });
      setHealth((await res.json()) as DatabaseHealth);
    } catch {
      // The portal itself isn't answering. Whatever is on screen came from it,
      // so leave the last known state rather than inventing a new alarm.
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [check]);

  if (!health || health.status === "ok") return null;

  const unhealthy = health.services.filter(
    (service) => service.severity !== "ok",
  );
  const empty = unhealthy.filter((service) => service.status === "empty");
  const silent = unhealthy.filter((service) => service.status === "unreachable");
  const groupSilent = silent.length >= GROUP_FROM;

  // Empty databases always collapse into one entry: they share a single fix,
  // and it isn't a per-service one.
  const listed = unhealthy.filter(
    (service) =>
      service.status !== "empty" &&
      !(groupSilent && service.status === "unreachable"),
  );

  const emptyOnly = empty.length === unhealthy.length;

  return (
    <div
      className={`db-alert db-alert--${health.status}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="db-alert__container">
        <h2 className="db-alert__title">
          {health.status === "error"
            ? "Database problem — this site is showing incomplete or missing data"
            : emptyOnly
              ? "No population yet — there is nothing for these pages to show"
              : "Some databases couldn't be checked"}
        </h2>

        <ul className="db-alert__services">
          {listed.map((service) => (
            <ServiceProblem key={service.key} service={service} />
          ))}

          {empty.length > 0 && <NoPopulation services={empty} />}

          {groupSilent && <SilentServices services={silent} />}
        </ul>

        <p className="db-alert__footer">
          <button
            type="button"
            className="db-alert__recheck"
            onClick={check}
            disabled={checking}
          >
            {checking ? "Checking…" : "Check again"}
          </button>
          <span className="db-alert__checked">
            Last checked {new Date(health.checkedAt).toLocaleTimeString()}
          </span>
        </p>
      </div>
    </div>
  );
}
