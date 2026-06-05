"use client";

import { useState, useEffect } from "react";

interface DashboardStats {
  totalCitizens: number | null;
  recentBirths: number | null;
  activeEnrollments: number | null;
  overdueVaccinations: number | null;
}

export default function StaffDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalCitizens: null,
    recentBirths: null,
    activeEnrollments: null,
    overdueVaccinations: null,
  });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    async function loadStats() {
      const errs: string[] = [];

      // Fetch citizens count
      try {
        const res = await fetch("http://localhost:3001/citizens/search?name=");
        if (res.ok) {
          const data = await res.json();
          setStats((s) => ({
            ...s,
            totalCitizens: Array.isArray(data) ? data.length : 0,
          }));
        } else {
          errs.push("Identity service unavailable");
        }
      } catch {
        errs.push("Identity service unavailable");
      }

      // Fetch recent births (this month)
      try {
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const res = await fetch(
          `http://localhost:3002/births?since=${encodeURIComponent(monthStart)}`
        );
        if (res.ok) {
          const data = await res.json();
          setStats((s) => ({
            ...s,
            recentBirths: Array.isArray(data) ? data.length : 0,
          }));
        } else {
          // Try a fallback - just get all births
          const fallback = await fetch("http://localhost:3002/births");
          if (fallback.ok) {
            const data = await fallback.json();
            setStats((s) => ({
              ...s,
              recentBirths: Array.isArray(data) ? data.length : 0,
            }));
          }
        }
      } catch {
        errs.push("Civil registry service unavailable");
      }

      // Fetch overdue vaccinations
      try {
        const today = new Date().toISOString().split("T")[0];
        const res = await fetch(
          `http://localhost:3003/vaccinations/overdue?as_of=${encodeURIComponent(today)}`
        );
        if (res.ok) {
          const data = await res.json();
          setStats((s) => ({
            ...s,
            overdueVaccinations: Array.isArray(data) ? data.length : 0,
          }));
        }
      } catch {
        errs.push("Health service unavailable");
      }

      // Fetch active enrollments
      try {
        const res = await fetch(
          "http://localhost:3004/enrollments?status=active"
        );
        if (res.ok) {
          const data = await res.json();
          setStats((s) => ({
            ...s,
            activeEnrollments: Array.isArray(data) ? data.length : 0,
          }));
        }
      } catch {
        errs.push("Benefits service unavailable");
      }

      if (errs.length > 0) setErrors(errs);
    }

    loadStats();
  }, []);

  return (
    <>
      <a href="/" className="govuk-back-link">
        Back
      </a>

      <nav className="govuk-breadcrumbs" aria-label="Breadcrumb">
        <ol className="govuk-breadcrumbs__list">
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/">
              Home
            </a>
          </li>
          <li className="govuk-breadcrumbs__list-item">Staff area</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Staff dashboard</h1>

      {errors.length > 0 && (
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title">
            Some services are unavailable
          </h2>
          <ul className="govuk-error-summary__list">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="govuk-stat-grid">
        <div className="govuk-stat">
          <div className="govuk-stat__value">
            {stats.totalCitizens !== null ? stats.totalCitizens : "-"}
          </div>
          <div className="govuk-stat__label">Registered citizens</div>
        </div>
        <div className="govuk-stat">
          <div className="govuk-stat__value">
            {stats.recentBirths !== null ? stats.recentBirths : "-"}
          </div>
          <div className="govuk-stat__label">Births registered</div>
        </div>
        <div className="govuk-stat">
          <div className="govuk-stat__value">
            {stats.activeEnrollments !== null ? stats.activeEnrollments : "-"}
          </div>
          <div className="govuk-stat__label">Active enrollments</div>
        </div>
        <div className="govuk-stat">
          <div className="govuk-stat__value">
            {stats.overdueVaccinations !== null
              ? stats.overdueVaccinations
              : "-"}
          </div>
          <div className="govuk-stat__label">Overdue vaccinations</div>
        </div>
      </div>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">Actions</h2>

      <div className="govuk-card-grid">
        <div className="govuk-card">
          <h3 className="govuk-card__title">
            <a href="/staff/search" className="govuk-link">
              Search citizens
            </a>
          </h3>
          <p className="govuk-card__description">
            Search for citizens by name or date of birth and view their full
            record.
          </p>
        </div>
        <div className="govuk-card">
          <h3 className="govuk-card__title">
            <a href="/births" className="govuk-link">
              Register a birth
            </a>
          </h3>
          <p className="govuk-card__description">
            Register a new birth in the civil registry.
          </p>
        </div>
        <div className="govuk-card">
          <h3 className="govuk-card__title">
            <a href="/deaths" className="govuk-link">
              Register a death
            </a>
          </h3>
          <p className="govuk-card__description">
            Register a death in the civil registry.
          </p>
        </div>
        <div className="govuk-card">
          <h3 className="govuk-card__title">
            <a href="/vaccinations" className="govuk-link">
              Record vaccination
            </a>
          </h3>
          <p className="govuk-card__description">
            Record a vaccination for a patient.
          </p>
        </div>
      </div>
    </>
  );
}
