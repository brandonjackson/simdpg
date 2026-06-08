import { SYSTEMS } from "@/lib/systems-registry";
import SandboxConsole, {
  type SandboxSystem,
} from "@/components/SandboxConsole";

export default function SandboxPage() {
  const systems: SandboxSystem[] = SYSTEMS.map((s) => ({
    id: s.id,
    name: s.name,
    port: s.port,
    built: s.status === "built",
    buildingBlock: s.buildingBlock,
    endpoints: s.endpoints,
  }));

  const builtCount = systems.filter((s) => s.built).length;

  return (
    <>
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
          <li className="govuk-breadcrumbs__list-item">API sandbox</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">API sandbox</h1>
      <p className="govuk-body-l">
        Send and receive live API requests to any SimDPG system from one place
        &mdash; explore how the systems work, inspect responses, and try out the
        endpoints OpenFn workflows will call. Pick a system, choose a documented
        endpoint (or craft a custom request), and hit <strong>Send</strong>.
      </p>

      <div className="govuk-inset-text">
        Requests are proxied through the portal, so there is no CORS setup to
        worry about. The {builtCount} built systems must be running (
        <code>npm run dev:systems</code>) to receive requests; the Payments stub
        is listed for reference but cannot be called yet.
        Each system also has its own page in the{" "}
        <a href="/staff/systems-catalog" className="govuk-link">
          systems catalog
        </a>{" "}
        with the same sandbox plus full data-model and webhook documentation.
      </div>

      <SandboxConsole systems={systems} />

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <p className="govuk-body-s">
        <a href="/staff" className="govuk-link">
          Back to staff dashboard
        </a>
      </p>
    </>
  );
}
