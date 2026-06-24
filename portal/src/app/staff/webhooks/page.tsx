import { SYSTEMS } from "@/lib/systems-registry";
import { WebhookRegistry } from "@/components/WebhookRegistry";
import { FormWebhookRegistry } from "@/components/FormWebhookRegistry";

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

      <h2 className="govuk-heading-l">Form submissions</h2>
      <p className="govuk-body">
        Choose where each portal form is submitted. Every service form posts to
        a central point in the portal, which forwards the submission to the URL
        you register here &mdash; so you can wire a form to a workflow without
        redeploying. Each form submits to a single webhook and waits for its
        reply.
      </p>
      <div className="govuk-inset-text">
        The form payload is POSTed unchanged, with the form&rsquo;s key in an{" "}
        <code>X-SimDPG-Form</code> header. Forms that were previously configured
        with an <code>OPENFN_*</code> environment variable keep using it until a
        URL is registered here, which then takes precedence.
      </div>

      <FormWebhookRegistry />

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">System events</h2>
      <p className="govuk-body">
        When a system emits an event, it is delivered to every URL registered
        for that event type &mdash; so a single event can fan out to several
        workflows.
      </p>
      <div className="govuk-inset-text">
        Each event is delivered as a DCI/CloudEvents envelope
        (<code>{`{ id, type, source, time, data }`}</code>) by HTTP POST. The
        legacy <code>WEBHOOK_URL</code> environment variable, if set on a system,
        still receives every event as an additional catch-all target.
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
