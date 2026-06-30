"use client";

import { useCallback, useEffect, useState } from "react";
import type { SimulationRecord, SimulationStatus } from "@/lib/simulations/store";

interface SimulationResponse {
  simulation?: SimulationRecord;
  error?: string;
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
      return "govuk-tag govuk-tag--yellow";
  }
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

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
    if (simulation?.status !== "running") return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [simulation?.status]);

  useEffect(() => {
    if (simulation?.status !== "running") return;

    const actualElapsedSeconds = getActualElapsedSeconds(simulation, nowMs);
    const simulatedElapsedSeconds = getSimulatedElapsedSeconds(
      simulation,
      actualElapsedSeconds,
    );

    if (simulatedElapsedSeconds >= simulation.parameters.durationSeconds) {
      refresh();
    }
  }, [nowMs, refresh, simulation]);

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
              {simulation.status}
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
            simulation.status === "completed") && (
            <div className="govuk-inset-text">
              The simulation has finished running. Stats will appear here once
              event logging is connected.
            </div>
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
            simulation.status === "completed") && (
            <>
              <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
              <h2 className="govuk-heading-l">Stats</h2>
              <p className="govuk-body">
                No simulation stats have been recorded yet.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}