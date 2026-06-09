import { SYSTEMS } from "@/lib/systems-registry";
import { WebhookRegistry } from "@/components/WebhookRegistry";

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
        Register the OpenFn (or any HTTP) endpoints that should receive each
        system event. When a system emits an event, it is delivered to every URL
        registered for that event type &mdash; so a single event can fan out to
        several workflows.
      </p>
      <div className="govuk-inset-text">
        Each event is delivered as a DCI/CloudEvents envelope
        (<code>{`{ id, type, source, time, data }`}</code>) by HTTP POST. In
        OpenFn, point each URL at a workflow&rsquo;s Webhook trigger. The legacy{" "}
        <code>WEBHOOK_URL</code> environment variable, if set on a system, still
        receives every event as an additional catch-all target.
      </div>

      <WebhookRegistry catalog={catalog} />

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
      <p className="govuk-body-s">
        <a href="/staff" className="govuk-link">
          Back to staff dashboard
        </a>
      </p>
    </>
  );
}
