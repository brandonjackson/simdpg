import { SYSTEMS } from "@/lib/systems-registry";
import { WebhookRegistration } from "@/components/WebhookRegistration";

export const dynamic = "force-dynamic";

/**
 * The full catalog of emittable events, grouped by the system that emits them.
 * Sourced from the systems registry so it stays in step with the documented
 * webhook events. Systems that emit nothing are omitted.
 */
const catalog = SYSTEMS.filter((s) => s.webhooks.length > 0).map((s) => ({
  id: s.id,
  name: s.name,
  events: s.webhooks,
}));

export default function WebhooksPage() {
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
          <li className="govuk-breadcrumbs__list-item">Webhook registration</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Webhook registration</h1>
      <p className="govuk-body-l">
        Register the OpenFn (or any HTTP) endpoints that should receive system
        events and portal form submissions. Point each URL at a workflow&rsquo;s
        Webhook trigger in OpenFn.
      </p>
      <p className="govuk-body">
        Registrations are saved against a <strong>project</strong> &mdash; one set
        of URLs, normally one OpenFn project. Clone an OpenFn project five times
        and you register five projects here, each with its own workflow URLs, then
        pick the project you want when starting a simulation. Manage the list on
        the{" "}
        <a className="govuk-link" href="/staff/projects">
          Projects
        </a>{" "}
        page.
      </p>

      <WebhookRegistration catalog={catalog} />

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
      <p className="govuk-body-s">
        <a href="/staff" className="govuk-link">
          Back to staff dashboard
        </a>
      </p>
    </>
  );
}
