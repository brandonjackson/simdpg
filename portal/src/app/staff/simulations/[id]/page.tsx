"use client";

import { useCallback, useEffect, useState } from "react";
import type { SimulationRecord, SimulationStatus } from "@/lib/simulations/store";
import type { SimulationEvent } from "@/lib/simulations/events";
import type { GenerationSummary } from "@/lib/simulations/generation";
import {
  GENERATOR_CONFIG_FIELDS,
  getConfigValue,
} from "@/lib/simulations/generators/config";
import { parseStats } from "@/lib/simulations/stats";
import {
  BEHAVIOR_OFF,
  behaviorPresetLabel,
  describeBehavior,
  isBehaviorOff,
  type BehaviorConfig,
} from "@simdpg/system-kit/behavior";
import type { SystemBehaviorResult } from "@/lib/system-behavior";

interface SimulationResponse {
  simulation?: SimulationRecord;
  error?: string;
}

interface EventsResponse {
  events?: SimulationEvent[];
  generation?: GenerationSummary | null;
  error?: string;
}

interface SystemBehaviorResponse {
  systems?: SystemBehaviorResult[];
  enabled?: boolean;
  error?: string;
}

/**
 * A run's behaviour config. Runs created before system behaviour existed have no
 * block; those left the systems alone, so they read as off.
 */
function behaviorOf(simulation: SimulationRecord): BehaviorConfig {
  return simulation.parameters.behavior ?? BEHAVIOR_OFF;
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

/**
 * Why an event script came out empty. Generation draws random events from the
 * *existing* population at per-simulated-day rates, so an empty script means
 * either there was nobody to draw from, or the run was too short (or its rates
 * too low) for a single draw to land — neither of which the empty list itself
 * can tell you.
 */
function explainNoEvents(generation: GenerationSummary | null): string {
  if (!generation) {
    return "This run was generated before the portal recorded what generation drew on, so there is nothing more to say about it. Create a new simulation to see those details.";
  }

  if (generation.citizens === 0) {
    return "The Identity system had no alive citizens when this was generated, and events are drawn from the existing population. Seed the systems (npm run setup) or generate a population (npm run setup:generate), then create a new simulation.";
  }

  return (
    `Generation drew on ${plural(generation.citizens, "alive citizen")} over ` +
    `${formatDuration(generation.days * 86_400)} of simulated time. Generator rates are ` +
    "per simulated day, so a short run at low rates often lands no events at all. " +
    "Create a new simulation with a longer duration or higher rates."
  );
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
  const [generation, setGeneration] = useState<GenerationSummary | null>(null);
  const [systemBehavior, setSystemBehavior] = useState<SystemBehaviorResult[] | null>(
    null,
  );
  const [resettingBehavior, setResettingBehavior] = useState(false);

  // Derived early because the polling effect below keys off it.
  const behaviorConfig = simulation ? behaviorOf(simulation) : BEHAVIOR_OFF;
  const behaviorEnabled = !isBehaviorOff(behaviorConfig);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/simulations/${params.id}/events`, {
        cache: "no-store",
      });
      const data = (await res.json()) as EventsResponse;
      if (res.ok && data.events) {
        setEvents(data.events);
        setGeneration(data.generation ?? null);
      }
    } catch {
      // Non-fatal: the events section simply stays hidden.
    }
  }, [params.id]);

  /** What the systems are actually doing right now, across all seven. */
  const loadSystemBehavior = useCallback(async () => {
    try {
      const res = await fetch("/api/systems/behavior", { cache: "no-store" });
      const data = (await res.json()) as SystemBehaviorResponse;
      if (res.ok && data.systems) setSystemBehavior(data.systems);
    } catch {
      // Non-fatal: the live section simply stays hidden.
    }
  }, []);

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

  // Show what the systems are doing whenever this run configured behaviour: live
  // while it runs, and once more when it ends to confirm they went back to normal.
  useEffect(() => {
    if (!behaviorEnabled) return;

    void loadSystemBehavior();
    if (simulation?.status !== "running") return;

    const interval = window.setInterval(() => {
      void loadSystemBehavior();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [behaviorEnabled, simulation?.status, loadSystemBehavior]);

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

  /**
   * Put the systems back to their defaults by hand. The worker does this itself
   * when a run ends, and each system expires its config anyway — this is for the
   * case where a worker was killed before it could.
   */
  async function resetSystemBehavior() {
    setError(null);
    setResettingBehavior(true);

    try {
      const res = await fetch("/api/systems/behavior", { method: "DELETE" });
      const data = (await res.json()) as SystemBehaviorResponse & { failed?: string[] };
      if (!res.ok) throw new Error(data.error || "Could not reset system behaviour");
      if (data.systems) setSystemBehavior(data.systems);
      if (data.failed?.length) {
        throw new Error(
          `Could not reach ${data.failed.join(", ")} — those systems keep their behaviour until it expires`,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset system behaviour",
      );
    } finally {
      setResettingBehavior(false);
    }
  }

  const liveBehaviorSystems = systemBehavior?.filter((s) => s.state?.enabled) ?? [];
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

          {behaviorEnabled && (
            <>
              <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
              <h2 className="govuk-heading-l">System behaviour</h2>
              <p className="govuk-body">
                This run makes all seven systems behave as{" "}
                <strong>{behaviorPresetLabel(behaviorConfig)}</strong>:{" "}
                {describeBehavior(behaviorConfig)}. The worker applies it when the
                run starts and clears it when the run ends.
              </p>

              {systemBehavior === null ? (
                <p className="govuk-body-s">Checking what the systems are doing…</p>
              ) : (
                <>
                  <table className="govuk-table">
                    <thead className="govuk-table__head">
                      <tr className="govuk-table__row">
                        <th scope="col" className="govuk-table__header">
                          System
                        </th>
                        <th scope="col" className="govuk-table__header">
                          Behaviour
                        </th>
                        <th scope="col" className="govuk-table__header">
                          Requests
                        </th>
                        <th scope="col" className="govuk-table__header">
                          Delayed
                        </th>
                        <th scope="col" className="govuk-table__header">
                          Failures injected
                        </th>
                        <th scope="col" className="govuk-table__header">
                          Rate limited
                        </th>
                      </tr>
                    </thead>
                    <tbody className="govuk-table__body">
                      {systemBehavior.map((system) => (
                        <tr className="govuk-table__row" key={system.id}>
                          <td className="govuk-table__cell">{system.label}</td>
                          <td className="govuk-table__cell">
                            {!system.ok ? (
                              <span className="govuk-tag govuk-tag--grey">
                                Unreachable
                              </span>
                            ) : system.state?.enabled ? (
                              // The full description is in the paragraph above;
                              // per row, the preset name (or "Custom") is enough
                              // to spot a system that got something different.
                              <span
                                className="govuk-tag govuk-tag--yellow"
                                title={describeBehavior(system.state.config)}
                              >
                                {behaviorPresetLabel(system.state.config)}
                              </span>
                            ) : (
                              <span className="govuk-tag govuk-tag--green">Default</span>
                            )}
                          </td>
                          <td className="govuk-table__cell">
                            {system.state?.counters.requests ?? "—"}
                          </td>
                          <td className="govuk-table__cell">
                            {system.state?.counters.delayed ?? "—"}
                          </td>
                          <td className="govuk-table__cell">
                            {system.state?.counters.injected_errors ?? "—"}
                          </td>
                          <td className="govuk-table__cell">
                            {system.state?.counters.rate_limited ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {liveBehaviorSystems.length > 0 ? (
                    <>
                      <p className="govuk-body-s">
                        {simulation.status === "running"
                          ? "Counters update every few seconds while the run is in progress."
                          : "The run has finished but these systems are still degraded — clear them here."}
                      </p>
                      <button
                        type="button"
                        className="govuk-button govuk-button--secondary"
                        onClick={resetSystemBehavior}
                        disabled={resettingBehavior}
                      >
                        {resettingBehavior
                          ? "Resetting..."
                          : "Reset all systems to default"}
                      </button>
                    </>
                  ) : (
                    <p className="govuk-body-s">
                      All systems are back to their default behaviour.
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {hasGeneratedEvents(simulation.status) && events !== null && (
            <>
              <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
              <h2 className="govuk-heading-l">Generated events</h2>

              {events.length === 0 ? (
                <>
                  <p className="govuk-body">
                    No events were generated for this simulation.
                  </p>
                  <div className="govuk-inset-text">
                    {explainNoEvents(generation)}
                  </div>
                </>
              ) : (
                <>
                  {generation && generation.unroutedEvents > 0 && (
                    <div className="govuk-inset-text">
                      {generation.unroutedEvents === events.length
                        ? `None of the ${plural(events.length, "generated event")} have`
                        : `${generation.unroutedEvents} of the ${plural(events.length, "generated event")} have`}{" "}
                      a webhook registered for this run&apos;s project (
                      {generation.unroutedTargets.join(", ")}), so the run will
                      skip them rather than deliver them. Register those forms
                      under Webhooks, then create a new simulation.
                    </div>
                  )}

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
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">System behaviour</dt>
              <dd className="govuk-summary-list__value">
                {behaviorPresetLabel(behaviorConfig)}
                <br />
                <span className="govuk-body-s">
                  {describeBehavior(behaviorConfig)}
                </span>
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
                <>
                  <p className="govuk-body">
                    Every event in a run is one POST to the webhook URL
                    registered for that form in this simulation&apos;s project —
                    usually an OpenFn workflow&apos;s Webhook trigger. These
                    counts say what happened to each POST.
                  </p>
                  <div className="govuk-stat-grid">
                    <div className="govuk-stat">
                      <div className="govuk-stat__value">{stats.delivered}</div>
                      <div className="govuk-stat__label">Delivered</div>
                      <p className="govuk-stat__hint">
                        Sent and accepted: the webhook answered with a 2xx.
                      </p>
                    </div>
                    <div className="govuk-stat">
                      <div className="govuk-stat__value">{stats.skipped}</div>
                      <div className="govuk-stat__label">Skipped</div>
                      <p className="govuk-stat__hint">
                        Never sent anywhere — no webhook URL is registered for
                        that form in this project, so there was nowhere to post
                        it.
                      </p>
                    </div>
                    <div className="govuk-stat">
                      <div className="govuk-stat__value">{stats.failed}</div>
                      <div className="govuk-stat__label">Failed</div>
                      <p className="govuk-stat__hint">
                        Sent, but rejected: the webhook returned a non-2xx
                        status, timed out, or could not be reached.
                      </p>
                    </div>
                    <div className="govuk-stat">
                      <div className="govuk-stat__value">{stats.total}</div>
                      <div className="govuk-stat__label">Total</div>
                      <p className="govuk-stat__hint">
                        Events the run was scheduled to send. The other three
                        add up to less than this if the run was stopped early.
                      </p>
                    </div>
                  </div>
                  {simulation.parameters.projectId && stats.skipped > 0 && (
                    <p className="govuk-body">
                      To stop events being skipped,{" "}
                      <a
                        className="govuk-link"
                        href={`/staff/webhooks?project=${encodeURIComponent(simulation.parameters.projectId)}`}
                      >
                        register a webhook URL for every form
                      </a>{" "}
                      in this project before the next run.
                    </p>
                  )}
                </>
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