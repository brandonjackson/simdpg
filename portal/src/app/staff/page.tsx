import { SYSTEM_URLS } from "@simdpg/api-clients";
import { identity, health } from "@/lib/systems";

export const dynamic = "force-dynamic";

interface DashboardStats {
  totalCitizens: number | null;
  recentBirths: number | null;
  activeEnrollments: number | null;
  overdueVaccinations: number | null;
}

async function loadStats(): Promise<{
  stats: DashboardStats;
  errors: string[];
}> {
  const stats: DashboardStats = {
    totalCitizens: null,
    recentBirths: null,
    activeEnrollments: null,
    overdueVaccinations: null,
  };
  const errors: string[] = [];

  const citizenPromise = identity
    .getStats()
    .then((data) => {
      stats.totalCitizens = data.citizens;
    })
    .catch(() => {
      errors.push("Identity system unavailable");
    });

  const birthPromise = (async () => {
    try {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const civilRegistryUrl = SYSTEM_URLS.civilRegistry;
      const res = await fetch(
        `${civilRegistryUrl}/births?since=${encodeURIComponent(monthStart)}`
      );
      if (res.ok) {
        const data = await res.json();
        stats.recentBirths = Array.isArray(data) ? data.length : 0;
      } else {
        const fallback = await fetch(`${civilRegistryUrl}/births`);
        if (fallback.ok) {
          const data = await fallback.json();
          stats.recentBirths = Array.isArray(data) ? data.length : 0;
        }
      }
    } catch {
      errors.push("Civil registry system unavailable");
    }
  })();

  const overduePromise = (async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const data = await health.getOverdueVaccinations(today);
      stats.overdueVaccinations = Array.isArray(data) ? data.length : 0;
    } catch {
      errors.push("Health system unavailable");
    }
  })();

  const enrollmentPromise = (async () => {
    try {
      // The client doesn't have a direct "list all active enrollments" method,
      // so we'll hit the endpoint directly
      const res = await fetch(
        `${SYSTEM_URLS.benefits}/enrollments?status=active`
      );
      if (res.ok) {
        const data = await res.json();
        stats.activeEnrollments = Array.isArray(data) ? data.length : 0;
      }
    } catch {
      errors.push("Benefits system unavailable");
    }
  })();

  await Promise.all([
    citizenPromise,
    birthPromise,
    overduePromise,
    enrollmentPromise,
  ]);

  return { stats, errors };
}

export default async function StaffDashboard() {
  const { stats, errors } = await loadStats();

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
            Some systems are unavailable
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
            <a href="/services/birth-registration" className="govuk-link">
              Register a birth
            </a>
          </h3>
          <p className="govuk-card__description">
            Register a new birth in the civil registry.
          </p>
        </div>
        <div className="govuk-card">
          <h3 className="govuk-card__title">
            <a href="/services/death-registration" className="govuk-link">
              Register a death
            </a>
          </h3>
          <p className="govuk-card__description">
            Register a death in the civil registry.
          </p>
        </div>
        <div className="govuk-card">
          <h3 className="govuk-card__title">
            <a href="/services/vaccination" className="govuk-link">
              Record vaccination
            </a>
          </h3>
          <p className="govuk-card__description">
            Record a vaccination for a patient.
          </p>
        </div>
        <div className="govuk-card">
          <h3 className="govuk-card__title">
            <a href="/staff/population" className="govuk-link">
              Population management
            </a>
          </h3>
          <p className="govuk-card__description">
            View population stats, generate a configurable population, or wipe
            all data across systems.
          </p>
        </div>
        <div className="govuk-card">
          <h3 className="govuk-card__title">
            <a href="/staff/simulations" className="govuk-link">
              Simulation management
            </a>
          </h3>
          <p className="govuk-card__description">
            Create simulation runs, set clock speed and duration, then generate
            and control each run from its details page.
          </p>
        </div>
      </div>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">Systems catalog</h2>
      <p className="govuk-body">
        Technical reference for the backend systems that power SimDPG &mdash;
        Identity, Civil Registry, Health, Benefits, Notifications, and Social
        Registry, plus the Payments stub. Each system has its own page with
        data models, API endpoints, webhook events, cross-system relationships,
        and an <strong>interactive API sandbox</strong> for sending live
        requests.
      </p>
      <a
        href="/staff/systems-catalog"
        className="govuk-button govuk-button--secondary"
        role="button"
      >
        View systems
      </a>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">API sandbox</h2>
      <p className="govuk-body">
        Send and receive live API requests to any system from one place &mdash;
        explore how the systems work, inspect responses, and try out the
        endpoints OpenFn workflows will call.
      </p>
      <a
        href="/staff/sandbox"
        className="govuk-button govuk-button--secondary"
        role="button"
      >
        Open API sandbox
      </a>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">Webhook registration</h2>
      <p className="govuk-body">
        Register the OpenFn endpoints that should fire when each system emits an
        event. Add one or more target URLs per event &mdash; every registered
        URL receives the event, so a single event can trigger several workflows.
      </p>
      <a
        href="/staff/webhooks"
        className="govuk-button govuk-button--secondary"
        role="button"
      >
        Register webhooks
      </a>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">Service catalog</h2>
      <p className="govuk-body">
        Reference documentation for all government services in the SimDPG
        platform, including customer journeys, backing systems, and OpenFn
        workflow specifications.
      </p>
      <a
        href="/staff/service-catalog"
        className="govuk-button govuk-button--secondary"
        role="button"
      >
        View services
      </a>
    </>
  );
}
