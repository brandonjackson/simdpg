"use client";

import { useCallback, useEffect, useState } from "react";
import type { SimulationRecord, SimulationStatus } from "@/lib/simulations/store";
import type { SimulationEvent } from "@/lib/simulations/events";
import {
  GENERATOR_CONFIG_FIELDS,
  getConfigValue,
} from "@/lib/simulations/generators/config";
import { parseStats } from "@/lib/simulations/stats";

interface SimulationResponse {
  simulation?: SimulationRecord;
  error?: string;
}

interface EventsResponse {
  events?: SimulationEvent[];
  error?: string;
}

/** Statuses for which a generated event script exists and can be shown. */
function hasGeneratedEvents(status: SimulationStatus): boolean {
  return status !== "created";
}

/** "marriage-registration" -> "Marriage registration". */
function formatEventType(targetKey: string): string {
  const spaced = targetKey.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface EventTypeCount {
  targetKey: string;
  count: number;
}

/** Count events per targetKey, ordered by descending count then key. */
function countEventTypes(events: SimulationEvent[]): EventTypeCount[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.targetKey, (counts.get(event.targetKey) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([targetKey, count]) => ({ targetKey, count }))
    .sort((a, b) => b.count - a.count || a.targetKey.localeCompare(b.targetKey));
}

interface PageProps {
  params: { id: string };
}

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return plural(seconds, "second");

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(plural(days, "day"));
  if (hours > 0) parts.push(plural(hours, "hour"));
  if (minutes > 0 && parts.length < 2) parts.push(plural(minutes, "minute"));
  if (parts.length === 0 && remainingSeconds > 0) {
    parts.push(plural(remainingSeconds, "second"));
  }

  return parts.join(" ");
}

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

function statusTagClass(status: SimulationStatus): string {
  switch (status) {
    case "created":
      return "govuk-tag govuk-tag--grey";
    case "generated":
      return "govuk-tag govuk-tag--blue";
    case "running":
    case "completed":
      return "govuk-tag govuk-tag--green";
    case "stopped":
    case "failed":
      return "govuk-tag govuk-tag--yellow";
  }
}

function statusLabel(status: SimulationStatus): string {
  switch (status) {
    case "created":
      return "Created";
    case "generated":
      return "Generated";
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

const EDITABLE_CONFIG_FIELDS = GENERATOR_CONFIG_FIELDS.filter((f) => f.editable);

function getEndTime(simulation: SimulationRecord): string | undefined {
  return simulation.stoppedAt ?? simulation.completedAt;
}

function getActualElapsedSeconds(
  simulation: SimulationRecord,
  nowMs: number,
): number {
  if (!simulation.startedAt) return 0;

  const startedAt = Date.parse(simulation.startedAt);
  const endAt = getEndTime(simulation);
  const endMs = endAt ? Date.parse(endAt) : nowMs;

  if (Number.isNaN(startedAt) || Number.isNaN(endMs)) return 0;
  return Math.max(0, (endMs - startedAt) / 1000);
}

function getSimulatedElapsedSeconds(
  simulation: SimulationRecord,
  actualElapsedSeconds: number,
): number {
  return Math.min(
    simulation.parameters.durationSeconds,
    actualElapsedSeconds * simulation.parameters.clockSpeed,
  );
}

export default function SimulationDetails({ params }: PageProps) {
  const [simulation, setSimulation] = useState<SimulationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [events, setEvents] = useState<SimulationEvent[] | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/simulations/${params.id}/events`, {
        cache: "no-store",
      });
      const data = (await res.json()) as EventsResponse;
      if (res.ok && data.events) {
        setEvents(data.events);
      }
    } catch {
      // Non-fatal: the events section simply stays hidden.
    }
  }, [params.id]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/simulations/${params.id}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as SimulationResponse;
      if (!res.ok || !data.simulation) {
        throw new Error(data.error || "Could not load simulation");
      }
      setSimulation(data.simulation);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load simulation");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (simulation && hasGeneratedEvents(simulation.status)) {
      loadEvents();
    }
  }, [simulation?.status, loadEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (simulation?.status !== "running") return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [simulation?.status]);

  // While a run is in progress, poll the backend so the status transition to a
  // terminal state (and its stats) shows up without a manual refresh. Polling
  // stops as soon as the record is no longer running.
  useEffect(() => {
    if (simulation?.status !== "running") return;

    const interval = window.setInterval(() => {
      refresh();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [simulation?.status, refresh]);

  async function runAction(action: "generate" | "start" | "stop") {
    setError(null);
    setActing(action);

    try {
      const res = await fetch(`/api/simulations/${params.id}/${action}`, {
        method: "POST",
      });
      const data = (await res.json()) as SimulationResponse;
      if (!res.ok || !data.simulation) {
        throw new Error(data.error || `Could not ${action} simulation`);
      }
      setSimulation(data.simulation);
      setNowMs(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} simulation`);
    } finally {
      setActing(null);
    }
  }

  const actualElapsedSeconds = simulation
    ? getActualElapsedSeconds(simulation, nowMs)
    : 0;
  const simulatedElapsedSeconds = simulation
    ? getSimulatedElapsedSeconds(simulation, actualElapsedSeconds)
    : 0;
  const estimatedActualSeconds = simulation
    ? simulation.parameters.durationSeconds / simulation.parameters.clockSpeed
    : 0;
  const stats = simulation ? parseStats(simulation.stats) : null;

  return (
    <>
      <a href="/staff/simulations" className="govuk-back-link">
        Back
      </a>

      <nav className="govuk-breadcrumbs" aria-label="Breadcrumb">
        <ol className="govuk-breadcrumbs__list">
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/">
              Home
            </a>
          </li>
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/staff">
              Staff area
            </a>
          </li>
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/staff/simulations">
              Simulations
            </a>
          </li>
          <li className="govuk-breadcrumbs__list-item">
            {shortId(params.id)}
          </li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Simulation details</h1>

      {error && (
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title">There is a problem</h2>
          <ul className="govuk-error-summary__list">
            <li>{error}</li>
          </ul>
        </div>
      )}

      {loading ? (
        <p className="govuk-body">Loading simulation...</p>
      ) : !simulation ? (
        <p className="govuk-body">Simulation not found.</p>
      ) : (
        <>
          <p className="govuk-body">
            <span className={statusTagClass(simulation.status)}>
              {statusLabel(simulation.status)}
            </span>
          </p>

          <h2 className="govuk-heading-l">Run controls</h2>

          {simulation.status === "created" && (
            <button
              type="button"
              className="govuk-button"
              onClick={() => runAction("generate")}
              disabled={acting !== null}
            >
              {acting === "generate" ? "Generating..." : "Generate"}
            </button>
          )}

          {simulation.status === "generated" && (
            <button
              type="button"
              className="govuk-button"
              onClick={() => runAction("start")}
              disabled={acting !== null}
            >
              {acting === "start" ? "Starting..." : "Start"}
            </button>
          )}

          {simulation.status === "running" && (
            <button
              type="button"
              className="govuk-button govuk-button--warning"
              onClick={() => runAction("stop")}
              disabled={acting !== null}
            >
              {acting === "stop" ? "Stopping..." : "Stop"}
            </button>
          )}

          {(simulation.status === "stopped" ||
            simulation.status === "completed" ||
            simulation.status === "failed") && (
            <div className="govuk-inset-text">
              The simulation has finished running. See the stats below.
            </div>
          )}

          {hasGeneratedEvents(simulation.status) && events !== null && (
            <>
              <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
              <h2 className="govuk-heading-l">Generated events</h2>

              {events.length === 0 ? (
                <p className="govuk-body">
                  No events were generated for this simulation.
                </p>
              ) : (
                <>
                  <div className="govuk-stat-grid">
                    <div className="govuk-stat">
                      <div className="govuk-stat__value">{events.length}</div>
                      <div className="govuk-stat__label">Total events</div>
                    </div>
                    {countEventTypes(events).map(({ targetKey, count }) => (
                      <div className="govuk-stat" key={targetKey}>
                        <div className="govuk-stat__value">{count}</div>
                        <div className="govuk-stat__label">
                          {formatEventType(targetKey)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <h3 className="govuk-heading-m">
                    Event schedule ({events.length})
                  </h3>
                  <div
                    style={{ maxHeight: "24rem", overflowY: "auto" }}
                    tabIndex={0}
                  >
                    <table className="govuk-table">
                      <thead className="govuk-table__head">
                        <tr className="govuk-table__row">
                          <th scope="col" className="govuk-table__header">
                            #
                          </th>
                          <th scope="col" className="govuk-table__header">
                            Event ID
                          </th>
                          <th scope="col" className="govuk-table__header">
                            Scheduled at
                          </th>
                          <th scope="col" className="govuk-table__header">
                            Event
                          </th>
                        </tr>
                      </thead>
                      <tbody className="govuk-table__body">
                        {events.map((event, index) => (
                          <tr className="govuk-table__row" key={event.id}>
                            <td className="govuk-table__cell">{index + 1}</td>
                            <td className="govuk-table__cell">
                              <code>{shortId(event.id)}</code>
                            </td>
                            <td className="govuk-table__cell">
                              {(event.scheduledMicros / 1_000_000).toFixed(3)}s
                            </td>
                            <td className="govuk-table__cell">
                              {formatEventType(event.targetKey)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

          <h2 className="govuk-heading-l">Timers</h2>
          <div className="govuk-stat-grid">
            <div className="govuk-stat">
              <div className="govuk-stat__value">
                {formatDuration(actualElapsedSeconds)}
              </div>
              <div className="govuk-stat__label">Actual elapsed time</div>
            </div>
            <div className="govuk-stat">
              <div className="govuk-stat__value">
                {formatDuration(simulatedElapsedSeconds)}
              </div>
              <div className="govuk-stat__label">Simulated elapsed time</div>
            </div>
          </div>

          <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

          <h2 className="govuk-heading-l">Parameters</h2>
          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Simulation ID</dt>
              <dd className="govuk-summary-list__value">{simulation.id}</dd>
            </div>
            {/* The project's name is snapshotted at creation, so a renamed or
                deleted project still reads correctly here. Runs created before
                projects existed have neither field. */}
            {(simulation.parameters.projectName ||
              simulation.parameters.projectId) && (
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Project</dt>
                <dd className="govuk-summary-list__value">
                  {simulation.parameters.projectName ||
                    simulation.parameters.projectId}
                  {simulation.parameters.projectId && (
                    <>
                      <br />
                      <a
                        className="govuk-link govuk-body-s"
                        href={`/staff/webhooks?project=${encodeURIComponent(simulation.parameters.projectId)}`}
                      >
                        View its webhook registrations
                      </a>
                    </>
                  )}
                </dd>
              </div>
            )}
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Clock speed</dt>
              <dd className="govuk-summary-list__value">
                {simulation.parameters.clockSpeed}x
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Simulation duration</dt>
              <dd className="govuk-summary-list__value">
                {formatDuration(simulation.parameters.durationSeconds)}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Estimated actual duration</dt>
              <dd className="govuk-summary-list__value">
                {formatDuration(estimatedActualSeconds)}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Population</dt>
              <dd className="govuk-summary-list__value">
                Existing population
              </dd>
            </div>
            {simulation.parameters.generatorConfig &&
              EDITABLE_CONFIG_FIELDS.map((field) => (
                <div className="govuk-summary-list__row" key={field.path.join(".")}>
                  <dt className="govuk-summary-list__key">{field.label}</dt>
                  <dd className="govuk-summary-list__value">
                    {getConfigValue(simulation.parameters.generatorConfig, field.path)}
                  </dd>
                </div>
              ))}
          </dl>

          <h2 className="govuk-heading-l">Timeline</h2>
          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Created</dt>
              <dd className="govuk-summary-list__value">
                {formatDate(simulation.createdAt)}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Generated</dt>
              <dd className="govuk-summary-list__value">
                {formatDate(simulation.generatedAt)}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Started</dt>
              <dd className="govuk-summary-list__value">
                {formatDate(simulation.startedAt)}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Stopped or completed</dt>
              <dd className="govuk-summary-list__value">
                {formatDate(getEndTime(simulation))}
              </dd>
            </div>
          </dl>

          {(simulation.status === "stopped" ||
            simulation.status === "completed" ||
            simulation.status === "failed") && (
            <>
              <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
              <h2 className="govuk-heading-l">Stats</h2>

              {simulation.status === "failed" && stats?.error && (
                <div className="govuk-error-summary" role="alert">
                  <h3 className="govuk-error-summary__title">
                    The simulation failed
                  </h3>
                  <div className="govuk-error-summary__body">
                    <p className="govuk-body">{stats.error}</p>
                  </div>
                </div>
              )}

              {stats ? (
                <div className="govuk-stat-grid">
                  <div className="govuk-stat">
                    <div className="govuk-stat__value">{stats.delivered}</div>
                    <div className="govuk-stat__label">Delivered</div>
                  </div>
                  <div className="govuk-stat">
                    <div className="govuk-stat__value">{stats.skipped}</div>
                    <div className="govuk-stat__label">Skipped</div>
                  </div>
                  <div className="govuk-stat">
                    <div className="govuk-stat__value">{stats.failed}</div>
                    <div className="govuk-stat__label">Failed</div>
                  </div>
                  <div className="govuk-stat">
                    <div className="govuk-stat__value">{stats.total}</div>
                    <div className="govuk-stat__label">Total</div>
                  </div>
                </div>
              ) : (
                <p className="govuk-body">
                  No simulation stats have been recorded yet.
                </p>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}