"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  type PopulationConfig,
  type AgeDistribution,
} from "@/lib/population/config";
import { ETHNIC_GROUPS, type EthnicGroup } from "@/lib/population/names";

interface StatsResponse {
  stats: {
    identity?: { citizens: number; alive: number; deceased: number; households: number };
    civilRegistry?: { births: number; deaths: number; marriages: number };
    health?: { patients: number; encounters: number; vaccinations: number };
    benefits?: { programs: number; enrollments: number; payments: number };
    notifications?: { notifications: number };
  };
  errors: string[];
}

interface GenerationResult {
  citizens: number;
  households: number;
  patients: number;
  conditions: number;
  enrollments: number;
  errors: number;
  durationMs: number;
  groupBreakdown: Record<string, number>;
}

interface RunRecord {
  id: string;
  timestamp: string;
  type: "generate" | "delete";
  outcome: "success" | "partial" | "failed";
  configSummary?: string;
  result?: GenerationResult;
  message?: string;
}

const AGE_OPTIONS: { value: AgeDistribution; label: string }[] = [
  { value: "young", label: "Young (children & young adults)" },
  { value: "balanced", label: "Balanced (default pyramid)" },
  { value: "ageing", label: "Ageing (older cohorts)" },
];

function pct(n: number): string {
  return `${Math.round(n * 100)}`;
}

export default function PopulationManagement() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [config, setConfig] = useState<PopulationConfig>(DEFAULT_CONFIG);

  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [statsRes, runsRes] = await Promise.all([
        fetch("/api/population/stats", { cache: "no-store" }),
        fetch("/api/population/runs", { cache: "no-store" }),
      ]);
      setStats(await statsRes.json());
      const runsData = await runsRes.json();
      setRuns(Array.isArray(runsData.runs) ? runsData.runs : []);
    } catch {
      setError("Could not load population data");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function update<K extends keyof PopulationConfig>(key: K, value: PopulationConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function toggleGroup(group: EthnicGroup) {
    setConfig((c) => {
      const has = c.ethnicityMix.includes(group);
      const next = has
        ? c.ethnicityMix.filter((g) => g !== group)
        : [...c.ethnicityMix, group];
      return { ...c, ethnicityMix: next.length > 0 ? next : c.ethnicityMix };
    });
  }

  async function handleGenerate() {
    setError(null);
    setMessage(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/population/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      const r: GenerationResult = data.result;
      setMessage(
        `Generated ${r.citizens} citizens in ${r.households} households ` +
          `(${r.patients} patients, ${r.conditions} pre-existing conditions, ` +
          `${r.enrollments} benefit enrollments) in ${(r.durationMs / 1000).toFixed(1)}s.` +
          (r.errors > 0 ? ` ${r.errors} operations failed.` : ""),
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setMessage(null);
    setDeleting(true);
    setConfirmDelete(false);
    try {
      const res = await fetch("/api/population/delete", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setMessage(data.run?.message || "Population deleted.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "population-config.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setConfig(normalizeConfig(JSON.parse(text)));
      setMessage("Config imported. Review the options, then generate.");
      setError(null);
    } catch {
      setError("Could not parse config file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const id = stats?.stats.identity;
  const cr = stats?.stats.civilRegistry;
  const he = stats?.stats.health;
  const be = stats?.stats.benefits;

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
          <li className="govuk-breadcrumbs__list-item">Population</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Population management</h1>
      <p className="govuk-body">
        Inspect, generate, and reset the simulated population across all
        systems.
      </p>

      {message && (
        <div
          className="govuk-notification-banner govuk-notification-banner--success"
          role="alert"
        >
          <h2 className="govuk-notification-banner__heading">{message}</h2>
        </div>
      )}

      {error && (
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title">There is a problem</h2>
          <ul className="govuk-error-summary__list">
            <li>{error}</li>
          </ul>
        </div>
      )}

      {stats && stats.errors.length > 0 && (
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title">
            Some systems are unavailable
          </h2>
          <ul className="govuk-error-summary__list">
            {stats.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      <h2 className="govuk-heading-l">Current population</h2>
      <div className="govuk-stat-grid">
        <div className="govuk-stat">
          <div className="govuk-stat__value">{id ? id.citizens : "-"}</div>
          <div className="govuk-stat__label">Citizens</div>
        </div>
        <div className="govuk-stat">
          <div className="govuk-stat__value">{id ? id.households : "-"}</div>
          <div className="govuk-stat__label">Households</div>
        </div>
        <div className="govuk-stat">
          <div className="govuk-stat__value">{id ? id.deceased : "-"}</div>
          <div className="govuk-stat__label">Deceased</div>
        </div>
        <div className="govuk-stat">
          <div className="govuk-stat__value">{cr ? cr.births : "-"}</div>
          <div className="govuk-stat__label">Births registered</div>
        </div>
        <div className="govuk-stat">
          <div className="govuk-stat__value">{cr ? cr.deaths : "-"}</div>
          <div className="govuk-stat__label">Deaths registered</div>
        </div>
        <div className="govuk-stat">
          <div className="govuk-stat__value">{cr ? cr.marriages : "-"}</div>
          <div className="govuk-stat__label">Marriages registered</div>
        </div>
        <div className="govuk-stat">
          <div className="govuk-stat__value">{he ? he.patients : "-"}</div>
          <div className="govuk-stat__label">Patients</div>
        </div>
        <div className="govuk-stat">
          <div className="govuk-stat__value">{be ? be.enrollments : "-"}</div>
          <div className="govuk-stat__label">Benefit enrollments</div>
        </div>
      </div>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      {/* ---------------------------------------------------------------- */}
      <h2 className="govuk-heading-l">Generate new population</h2>
      <p className="govuk-body">
        Configure the generator and create a new population. This adds to any
        existing data &mdash; delete first for a clean slate.
      </p>

      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor="size">
          Population size (target number of citizens)
        </label>
        <input
          className="govuk-input govuk-input--width-10"
          id="size"
          type="number"
          min={1}
          max={1000000}
          value={config.size}
          onChange={(e) => update("size", Number(e.target.value))}
        />
        <div className="govuk-hint">
          Large sizes take a while &mdash; the generator issues one API call per
          record.
        </div>
      </div>

      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor="age">
          Age distribution
        </label>
        <select
          className="govuk-select"
          id="age"
          value={config.ageDistribution}
          onChange={(e) => update("ageDistribution", e.target.value as AgeDistribution)}
        >
          {AGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor="spread">
          Geographic spread (number of cities)
        </label>
        <input
          className="govuk-input govuk-input--width-5"
          id="spread"
          type="number"
          min={1}
          max={12}
          value={config.geographicSpread}
          onChange={(e) => update("geographicSpread", Number(e.target.value))}
        />
      </div>

      <div className="govuk-form-group">
        <label className="govuk-label">Household size (children per household)</label>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
          <div>
            <label className="govuk-hint" htmlFor="children-min">
              Min
            </label>
            <input
              className="govuk-input govuk-input--width-3"
              id="children-min"
              type="number"
              min={0}
              max={10}
              value={config.householdChildren.min}
              onChange={(e) =>
                update("householdChildren", {
                  ...config.householdChildren,
                  min: Number(e.target.value),
                })
              }
            />
          </div>
          <div>
            <label className="govuk-hint" htmlFor="children-max">
              Max
            </label>
            <input
              className="govuk-input govuk-input--width-3"
              id="children-max"
              type="number"
              min={0}
              max={10}
              value={config.householdChildren.max}
              onChange={(e) =>
                update("householdChildren", {
                  ...config.householdChildren,
                  max: Number(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="govuk-form-group">
        <label className="govuk-label">Language / ethnicity mix</label>
        <div className="govuk-hint">
          Names are drawn from the selected groups. Select at least one.
        </div>
        <div className="govuk-checkboxes">
          {ETHNIC_GROUPS.map((g) => (
            <div className="govuk-checkboxes__item" key={g}>
              <input
                className="govuk-checkboxes__input"
                id={`group-${g}`}
                type="checkbox"
                checked={config.ethnicityMix.includes(g)}
                onChange={() => toggleGroup(g)}
              />
              <label className="govuk-checkboxes__label" htmlFor={`group-${g}`}>
                {g}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor="conditions">
          Pre-existing conditions rate: {pct(config.preExistingConditionRate)}%
        </label>
        <div className="govuk-hint">
          Fraction of citizens given a chronic-condition encounter in the Health
          system.
        </div>
        <input
          id="conditions"
          type="range"
          min={0}
          max={100}
          value={pct(config.preExistingConditionRate)}
          onChange={(e) =>
            update("preExistingConditionRate", Number(e.target.value) / 100)
          }
          style={{ width: 300 }}
        />
      </div>

      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor="benefits">
          Benefit eligibility rate: {pct(config.benefitEligibilityRate)}%
        </label>
        <div className="govuk-hint">
          Fraction of adults enrolled in a random active benefit programme.
        </div>
        <input
          id="benefits"
          type="range"
          min={0}
          max={100}
          value={pct(config.benefitEligibilityRate)}
          onChange={(e) =>
            update("benefitEligibilityRate", Number(e.target.value) / 100)
          }
          style={{ width: 300 }}
        />
      </div>

      <button
        className="govuk-button"
        onClick={handleGenerate}
        disabled={generating || deleting}
      >
        {generating ? "Generating..." : "Generate population"}
      </button>

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="govuk-button govuk-button--secondary"
          onClick={handleExport}
          style={{ marginRight: 10 }}
        >
          Export config
        </button>
        <button
          type="button"
          className="govuk-button govuk-button--secondary"
          onClick={handleImportClick}
        >
          Import config
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          style={{ display: "none" }}
        />
      </div>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      {/* ---------------------------------------------------------------- */}
      <h2 className="govuk-heading-l">Delete population</h2>
      <div className="govuk-warning-text">
        <span className="govuk-warning-text__icon" aria-hidden="true">
          !
        </span>
        <strong className="govuk-warning-text__text">
          <span className="govuk-visually-hidden">Warning</span>
          This wipes all citizens, households, vital events, health records,
          enrollments, payments, and notifications across every system. Benefit
          programmes (reference data) are preserved. This cannot be undone.
        </strong>
      </div>

      {!confirmDelete ? (
        <button
          type="button"
          className="govuk-button govuk-button--warning"
          onClick={() => setConfirmDelete(true)}
          disabled={generating || deleting}
        >
          Delete all population data
        </button>
      ) : (
        <div className="govuk-inset-text">
          <p className="govuk-body">
            <strong>Are you sure?</strong> This permanently deletes all
            population data.
          </p>
          <button
            type="button"
            className="govuk-button govuk-button--warning"
            onClick={handleDelete}
            disabled={deleting}
            style={{ marginRight: 10 }}
          >
            {deleting ? "Deleting..." : "Yes, delete everything"}
          </button>
          <button
            type="button"
            className="govuk-button govuk-button--secondary"
            onClick={() => setConfirmDelete(false)}
            disabled={deleting}
          >
            Cancel
          </button>
        </div>
      )}

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      {/* ---------------------------------------------------------------- */}
      <h2 className="govuk-heading-l">Recent runs</h2>
      {runs.length === 0 ? (
        <p className="govuk-body">No generation or deletion runs recorded yet.</p>
      ) : (
        <table className="govuk-table">
          <thead>
            <tr>
              <th className="govuk-table__header">Time</th>
              <th className="govuk-table__header">Type</th>
              <th className="govuk-table__header">Summary</th>
              <th className="govuk-table__header">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="govuk-table__cell">
                  {new Date(run.timestamp).toLocaleString()}
                </td>
                <td className="govuk-table__cell">{run.type}</td>
                <td className="govuk-table__cell">
                  {run.type === "generate"
                    ? run.configSummary
                    : run.message}
                  {run.result && (
                    <>
                      <br />
                      <span style={{ fontSize: 14, color: "#505a5f" }}>
                        {run.result.citizens} citizens,{" "}
                        {run.result.households} households,{" "}
                        {run.result.enrollments} enrollments
                        {run.result.errors > 0
                          ? `, ${run.result.errors} errors`
                          : ""}
                      </span>
                    </>
                  )}
                </td>
                <td className="govuk-table__cell">
                  <span
                    className={`govuk-tag ${
                      run.outcome === "success"
                        ? "govuk-tag--green"
                        : run.outcome === "partial"
                          ? "govuk-tag--yellow"
                          : "govuk-tag--red"
                    }`}
                  >
                    {run.outcome}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
