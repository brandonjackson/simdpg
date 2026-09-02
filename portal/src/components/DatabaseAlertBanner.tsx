"use client";

import { useCallback, useEffect, useState } from "react";
import type { DatabaseHealth, ServiceDbHealth } from "@/lib/db-health";

/**
 * Site-wide banner for a database that isn't working.
 *
 * The failure this exists for is a quiet one: a system whose tables were never
 * created, or whose volume isn't mounted, still answers every request — with
 * nothing in it. Pages render, forms submit, and the population counter reads
 * 0, which looks exactly like a population of 0. Nothing is logged because
 * nothing threw.
 *
 * So this asks `/api/health/database` on load and every minute after, and when
 * something is wrong it says so at the top of every page, with the command to
 * run in that service's Railway console. It can't be dismissed: a banner you
 * can wave away is one you'll wave away and then spend an afternoon debugging
 * an empty database.
 */

/** How often to re-check while a page is open. */
const POLL_MS = 60_000;

/**
 * The two failures that hit every service at once — nothing seeded, or the
 * private network down — otherwise fill the banner with seven copies of the
 * same paragraph and bury the one service that is genuinely broken. Past this
 * many, services sharing a state collapse into a single entry.
 */
const GROUP_FROM = 3;

const STATUS_LABELS: Record<ServiceDbHealth["status"], string> = {
  ok: "OK",
  empty: "No data",
  error: "Broken",
  unreachable: "Not answering",
};

const CONSOLE_PATH = "open the service → ⋮ → Console";

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

/** One service, with everything known about what's wrong and how to fix it. */
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

/** Several services in the same state, said once. */
function GroupedProblem({
  services,
  status,
  summary,
  hint,
}: {
  services: ServiceDbHealth[];
  status: ServiceDbHealth["status"];
  summary: string;
  hint: string;
}) {
  const commands = services.flatMap((service) => service.commands);

  return (
    <li className="db-alert__service">
      <p className="db-alert__service-name">
        {services.length} services
        <span className="db-alert__tag">{STATUS_LABELS[status]}</span>
      </p>

      <p className="db-alert__problem">
        {services.map((service) => service.label).join(", ")} — {summary}
      </p>

      {commands.length > 0 && (
        <>
          <p className="db-alert__fix">
            Fix it in Railway, running each command in its own service&apos;s
            console ({CONSOLE_PATH}):
          </p>
          {commands.map((command) => (
            <CommandLine key={command} command={command} />
          ))}
        </>
      )}

      <p className="db-alert__hint">{hint}</p>
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
  const silent = unhealthy.filter((service) => service.status === "unreachable");
  const empty = unhealthy.filter((service) => service.status === "empty");
  const groupSilent = silent.length >= GROUP_FROM;
  const groupEmpty = empty.length >= GROUP_FROM;

  const listed = unhealthy.filter(
    (service) =>
      !(groupSilent && service.status === "unreachable") &&
      !(groupEmpty && service.status === "empty"),
  );

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
            : "Database warning — there is no data to show"}
        </h2>

        <ul className="db-alert__services">
          {listed.map((service) => (
            <ServiceProblem key={service.key} service={service} />
          ))}

          {groupEmpty && (
            <GroupedProblem
              services={empty}
              status="empty"
              summary="every one of them is empty, so every page built on their records shows nothing."
              hint="Nothing anywhere means the seed never ran. If you deleted the population on purpose, generate a new one from the staff area instead."
            />
          )}

          {groupSilent && (
            <GroupedProblem
              services={silent}
              status="unreachable"
              summary="none of them answered, so nothing they hold can be read."
              hint="Check the services are deployed and running (Railway → each service → Deployments). If they are, the portal can't reach them over the private network."
            />
          )}
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
