"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ClockSpeed,
  SimulationRecord,
  SimulationStatus,
} from "@/lib/simulations/store";
import {
  GENERATOR_CONFIG,
  GENERATOR_CONFIG_FIELDS,
  getConfigValue,
  setConfigValue,
  type FieldKind,
  type GeneratorConfig,
} from "@/lib/simulations/generators/config";

const CLOCK_SPEED_OPTIONS: { value: ClockSpeed; label: string }[] = [
  { value: 1, label: "1x - real time" },
  { value: 60, label: "60x - 1 minute per second" },
  { value: 3600, label: "3600x - 1 hour per second" },
  { value: 86400, label: "86400x - 1 day per second" },
];

const DURATION_UNITS = [
  { value: "minutes", label: "minutes", seconds: 60 },
  { value: "hours", label: "hours", seconds: 60 * 60 },
  { value: "days", label: "days", seconds: 24 * 60 * 60 },
] as const;

type DurationUnit = (typeof DURATION_UNITS)[number]["value"];

interface SimulationsResponse {
  simulations?: SimulationRecord[];
  error?: string;
}

interface SimulationResponse {
  simulation?: SimulationRecord;
  error?: string;
}

function getUnitSeconds(unit: DurationUnit): number {
  return DURATION_UNITS.find((option) => option.value === unit)?.seconds ?? 60;
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

  const parts: string[] = [];
  if (days > 0) parts.push(plural(days, "day"));
  if (hours > 0) parts.push(plural(hours, "hour"));
  if (minutes > 0 && parts.length < 2) parts.push(plural(minutes, "minute"));

  return parts.join(" ");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
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

function fieldInputProps(kind: FieldKind): { min: number; max?: number; step: number } {
  return kind === "probability"
    ? { min: 0, max: 1, step: 0.01 }
    : { min: 0, step: 0.0001 };
}

const EDITABLE_CONFIG_FIELDS = GENERATOR_CONFIG_FIELDS.filter((f) => f.editable);

export default function SimulationManagement() {
  const [simulations, setSimulations] = useState<SimulationRecord[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [clockSpeed, setClockSpeed] = useState<ClockSpeed>(3600);
  const [durationAmount, setDurationAmount] = useState(1);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("days");
  const [generatorConfig, setGeneratorConfig] =
    useState<GeneratorConfig>(GENERATOR_CONFIG);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/simulations", { cache: "no-store" });
      const data = (await res.json()) as SimulationsResponse;
      if (!res.ok) throw new Error(data.error || "Could not load simulations");
      setSimulations(Array.isArray(data.simulations) ? data.simulations : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load simulations");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const durationSeconds = Math.max(
    0,
    Math.round(durationAmount * getUnitSeconds(durationUnit)),
  );
  const realDurationSeconds = durationSeconds / clockSpeed;
  const canCreate = durationSeconds > 0 && !creating;

  async function handleCreate() {
    setError(null);
    setCreating(true);

    try {
      const res = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parameters: {
            clockSpeed,
            durationSeconds,
            generatorConfig,
          },
        }),
      });
      const data = (await res.json()) as SimulationResponse;
      if (!res.ok || !data.simulation) {
        throw new Error(data.error || "Could not create simulation");
      }
      window.location.href = `/staff/simulations/${data.simulation.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create simulation");
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);

    try {
      const res = await fetch(`/api/simulations/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not delete simulation");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete simulation");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <a href="/staff" className="govuk-back-link">
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
          <li className="govuk-breadcrumbs__list-item">Simulations</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Simulation management</h1>
      <p className="govuk-body">
        Create and manage simulation runs against the current population.
      </p>

      {error && (
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title">There is a problem</h2>
          <ul className="govuk-error-summary__list">
            <li>{error}</li>
          </ul>
        </div>
      )}

      {!showWizard && (
        <button
          type="button"
          className="govuk-button"
          onClick={() => setShowWizard(true)}
        >
          Start new simulation
        </button>
      )}

      {showWizard && (
        <>
          <h2 className="govuk-heading-l">Start new simulation</h2>

          <div className="govuk-inset-text">
            This simulation uses the existing population. Generate or reset the
            population from Population management before creating a simulation.
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="clock-speed">
              Clock speed
            </label>
            <div className="govuk-hint">
              Choose how quickly simulation time advances compared with actual
              time.
            </div>
            <select
              className="govuk-select"
              id="clock-speed"
              value={clockSpeed}
              onChange={(e) => setClockSpeed(Number(e.target.value) as ClockSpeed)}
            >
              {CLOCK_SPEED_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="duration-amount">
              Duration in simulation time
            </label>
            <div style={{ display: "flex", gap: 15, alignItems: "flex-end" }}>
              <input
                className="govuk-input govuk-input--width-5"
                id="duration-amount"
                type="number"
                min={1}
                value={durationAmount}
                onChange={(e) => setDurationAmount(Number(e.target.value))}
              />
              <select
                className="govuk-select"
                aria-label="Duration unit"
                value={durationUnit}
                onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
              >
                {DURATION_UNITS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <details className="govuk-details">
            <summary className="govuk-details__summary">
              <span className="govuk-details__summary-text">
                Advanced: event chances
              </span>
            </summary>
            <div className="govuk-details__text">
              <p className="govuk-body-s">
                Tune how often each random event occurs. Rates are per day per
                population; probabilities are between 0 and 1.
              </p>
              {EDITABLE_CONFIG_FIELDS.map((field) => {
                const id = `gen-${field.path.join("-")}`;
                const { min, max, step } = fieldInputProps(field.kind);
                return (
                  <div className="govuk-form-group" key={id}>
                    <label className="govuk-label" htmlFor={id}>
                      {field.label}
                    </label>
                    <input
                      className="govuk-input govuk-input--width-10"
                      id={id}
                      type="number"
                      min={min}
                      max={max}
                      step={step}
                      value={getConfigValue(generatorConfig, field.path)}
                      onChange={(e) =>
                        setGeneratorConfig((cfg) =>
                          setConfigValue(cfg, field.path, Number(e.target.value)),
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          </details>

          <div className="govuk-inset-text">
            <p className="govuk-body">
              <strong>Estimated actual run time:</strong>{" "}
              {formatDuration(realDurationSeconds)}
            </p>
            <p className="govuk-body-s">
              {formatDuration(durationSeconds)} of simulation time at {clockSpeed}x.
            </p>
          </div>

          <button
            type="button"
            className="govuk-button"
            onClick={handleCreate}
            disabled={!canCreate}
          >
            {creating ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            className="govuk-button govuk-button--secondary"
            onClick={() => setShowWizard(false)}
            disabled={creating}
            style={{ marginLeft: 10 }}
          >
            Cancel
          </button>

          <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
        </>
      )}

      <h2 className="govuk-heading-l">Simulations</h2>

      {simulations.length === 0 ? (
        <p className="govuk-body">No simulations have been created yet.</p>
      ) : (
        <table className="govuk-table">
          <thead>
            <tr>
              <th className="govuk-table__header">Created</th>
              <th className="govuk-table__header">Status</th>
              <th className="govuk-table__header">Clock speed</th>
              <th className="govuk-table__header">Duration</th>
              <th className="govuk-table__header">Estimated actual time</th>
              <th className="govuk-table__header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {simulations.map((simulation) => (
              <tr key={simulation.id}>
                <td className="govuk-table__cell">
                  <a
                    className="govuk-link"
                    href={`/staff/simulations/${simulation.id}`}
                  >
                    {shortId(simulation.id)}
                  </a>
                  <br />
                  <span className="govuk-body-s">
                    {formatDate(simulation.createdAt)}
                  </span>
                </td>
                <td className="govuk-table__cell">
                  <span className={statusTagClass(simulation.status)}>
                    {statusLabel(simulation.status)}
                  </span>
                </td>
                <td className="govuk-table__cell">
                  {simulation.parameters.clockSpeed}x
                </td>
                <td className="govuk-table__cell">
                  {formatDuration(simulation.parameters.durationSeconds)}
                </td>
                <td className="govuk-table__cell">
                  {formatDuration(
                    simulation.parameters.durationSeconds /
                      simulation.parameters.clockSpeed,
                  )}
                </td>
                <td className="govuk-table__cell">
                  <a
                    className="govuk-link"
                    href={`/staff/simulations/${simulation.id}`}
                  >
                    Open details
                  </a>
                  <br />
                  <button
                    type="button"
                    className="govuk-button govuk-button--warning"
                    onClick={() => handleDelete(simulation.id)}
                    disabled={deletingId === simulation.id}
                    style={{ marginTop: 10 }}
                  >
                    {deletingId === simulation.id ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}