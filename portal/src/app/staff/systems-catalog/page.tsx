import { SYSTEMS, STATUS_BADGE } from "@/lib/systems-registry";

export default function SystemsCatalog() {
  const systems = SYSTEMS;

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
          <li className="govuk-breadcrumbs__list-item">Systems catalog</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Systems catalog</h1>
      <p className="govuk-body-l">
        Technical reference for the backend systems of record that power SimDPG
        &mdash; the digital public infrastructure (DPI) building blocks of the
        city-state. Five systems are <strong>built and live</strong>; two more
        (Payments and Social Registry) are <strong>sketched as stubs</strong> so
        the full landscape is visible before we deepen anything. Each system is
        an independent service with its own database, API, and webhook events,
        communicating through HTTP APIs and webhook events routed via OpenFn
        workflows.
      </p>

      <p className="govuk-body">
        Select a system below to open its own page &mdash; data model, API
        endpoints, webhook events, cross-system relationships, and an{" "}
        <strong>interactive API sandbox</strong> for sending live requests to
        the running service.
      </p>

      <div className="govuk-inset-text">
        <strong>Status key:</strong>{" "}
        <span className="govuk-tag govuk-tag--green">Built</span> — live,
        running code.{" "}
        <span className="govuk-tag govuk-tag--yellow">Stub — sketch</span> —
        documented intent only, no code exists yet.{" "}
        <span className="govuk-tag govuk-tag--grey">Planned</span> — on the
        roadmap, not yet sketched.
      </div>

      <div className="govuk-inset-text">
        <strong>Architecture:</strong> All built systems share a common
        technology stack &mdash; Express.js, better-sqlite3, and Drizzle ORM
        running on TypeScript. Each system owns its own SQLite database and
        exposes a REST API. Cross-system coordination happens through webhook
        events processed by OpenFn integration workflows, which also plays the
        role of the information-mediator / exchange layer.
      </div>

      {/* ── System cards (one page each) ── */}
      <h2 className="govuk-heading-l">Systems</h2>
      <div className="govuk-card-grid">
        {systems.map((sys) => (
          <div key={sys.id} className="govuk-card">
            <h3 className="govuk-card__title">
              <a
                href={`/staff/systems-catalog/${sys.id}`}
                className="govuk-link"
              >
                {sys.name}
              </a>
              <span
                className={`govuk-tag ${STATUS_BADGE[sys.status].colour}`}
                style={{
                  fontSize: "11px",
                  marginLeft: "8px",
                  verticalAlign: "middle",
                }}
              >
                {STATUS_BADGE[sys.status].label}
              </span>
            </h3>
            <p className="govuk-body-s" style={{ marginBottom: "8px" }}>
              <code>:{sys.port}</code>
              {sys.sketch ? " (planned)" : ""} &middot; {sys.buildingBlock}
            </p>
            <p className="govuk-card__description">{sys.summary}</p>
          </div>
        ))}
      </div>

      <h2 className="govuk-heading-l">API conventions</h2>
      <p className="govuk-body">
        Every built system follows a shared set of conventions aligned with the{" "}
        <a
          className="govuk-link"
          href="https://docs.dci.global/"
          target="_blank"
          rel="noreferrer"
        >
          Digital Convergence Initiative (DCI)
        </a>{" "}
        and{" "}
        <a
          className="govuk-link"
          href="https://govstack.gitbook.io/specification/"
          target="_blank"
          rel="noreferrer"
        >
          GovStack
        </a>{" "}
        building-block specifications, so OpenFn workflows can integrate with
        each system the same way:
      </p>
      <ul className="govuk-list govuk-list--bullet">
        <li>
          <strong>Error envelope</strong> &mdash; every error returns{" "}
          <code>{`{ "error": { "code", "message", "details" } }`}</code> with a
          standard HTTP status.
        </li>
        <li>
          <strong>Pagination</strong> &mdash; list endpoints accept{" "}
          <code>?page=&amp;per_page=</code> and return{" "}
          <code>{`{ "data": [...], "meta": { "page", "per_page", "total" } }`}</code>
          .
        </li>
        <li>
          <strong>Traceability</strong> &mdash; an <code>X-Request-ID</code>{" "}
          header is honoured if supplied, otherwise minted, and echoed on every
          response.
        </li>
        <li>
          <strong>ISO 8601 dates</strong> everywhere (timestamps as{" "}
          <code>date-time</code>, calendar dates as <code>date</code>).
        </li>
        <li>
          <strong>DCI / CloudEvents-style webhooks</strong> &mdash; events are
          emitted as{" "}
          <code>{`{ id, type, source, time, data }`}</code> to the configured{" "}
          <code>WEBHOOK_URL</code> and logged locally for debugging.
        </li>
        <li>
          <strong>OpenAPI &amp; docs</strong> &mdash; each system ships an
          <code>openapi.yaml</code>, serves the raw spec at{" "}
          <code>/openapi.yaml</code>, and renders interactive docs at{" "}
          <code>/docs</code>.
        </li>
        <li>
          <strong>Webhook event log</strong> &mdash;{" "}
          <code>GET /admin/webhooks</code> returns a paginated log of every
          event the system has emitted, with delivery status.
        </li>
      </ul>

      <table className="govuk-table">
        <caption className="govuk-table__caption govuk-table__caption--m">
          Interactive API documentation
        </caption>
        <thead>
          <tr>
            <th className="govuk-table__header">System</th>
            <th className="govuk-table__header">Interactive docs</th>
            <th className="govuk-table__header">OpenAPI spec</th>
            <th className="govuk-table__header">Webhook log</th>
          </tr>
        </thead>
        <tbody>
          {systems
            .filter((sys) => sys.status === "built")
            .map((sys) => (
              <tr key={`docs-${sys.id}`}>
                <td className="govuk-table__cell">
                  <a
                    className="govuk-link"
                    href={`/staff/systems-catalog/${sys.id}`}
                  >
                    <strong>{sys.name}</strong>
                  </a>
                </td>
                <td className="govuk-table__cell">
                  <a
                    className="govuk-link"
                    href={`http://localhost:${sys.port}/docs`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <code>:{sys.port}/docs</code>
                  </a>
                </td>
                <td className="govuk-table__cell">
                  <code>:{sys.port}/openapi.yaml</code>
                </td>
                <td className="govuk-table__cell">
                  <code>:{sys.port}/admin/webhooks</code>
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <h2 className="govuk-heading-l">System overview</h2>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header" style={{ width: "16%" }}>
              System
            </th>
            <th className="govuk-table__header" style={{ width: "13%" }}>
              Status
            </th>
            <th className="govuk-table__header" style={{ width: "8%" }}>
              Port
            </th>
            <th className="govuk-table__header">Purpose</th>
          </tr>
        </thead>
        <tbody>
          {systems.map((sys) => (
            <tr key={sys.id}>
              <td className="govuk-table__cell">
                <a
                  href={`/staff/systems-catalog/${sys.id}`}
                  className="govuk-link"
                >
                  <strong>{sys.name}</strong>
                </a>
              </td>
              <td className="govuk-table__cell">
                <span
                  className={`govuk-tag ${STATUS_BADGE[sys.status].colour}`}
                  style={{ fontSize: "12px" }}
                >
                  {STATUS_BADGE[sys.status].label}
                </span>
              </td>
              <td className="govuk-table__cell">
                <code>:{sys.port}</code>
                {sys.sketch ? " (planned)" : ""}
              </td>
              <td className="govuk-table__cell">{sys.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="govuk-heading-l">How systems connect</h2>
      <p className="govuk-body">
        The Identity system sits at the centre of SimDPG. Every citizen gets a
        unique <code>citizen_id</code> from Identity, and all other systems
        reference that ID to link their records back to the person. When a life
        event happens (birth, death, marriage, vaccination, benefit enrolment),
        the originating system emits a webhook event. OpenFn workflows listen
        for these events and orchestrate the cross-system updates needed to keep
        all records consistent.
      </p>
      <p className="govuk-body">
        For example, when Civil Registry emits <code>birth.registered</code>,
        OpenFn workflows create a citizen in Identity, register a patient in
        Health, and check benefit eligibility in Benefits &mdash; all from that
        single event.
      </p>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">DPI building-block inventory</h2>
      <p className="govuk-body">
        A credible city-state needs a known set of digital public infrastructure
        building blocks. We take stock against common reference taxonomies
        &mdash; the{" "}
        <a
          className="govuk-link"
          href="https://govstack.gitbook.io/specification/"
          target="_blank"
          rel="noopener noreferrer"
        >
          GovStack
        </a>{" "}
        building blocks and the{" "}
        <a
          className="govuk-link"
          href="https://dci.dev/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Digital Convergence Initiative (DCI)
        </a>{" "}
        &mdash; to confirm each needed component has at least a presence in the
        repo. The system landscape is deliberately fixed: the five live systems,
        plus the two stubs below. New systems are not added lightly.
      </p>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header" style={{ width: "30%" }}>
              Building block
            </th>
            <th className="govuk-table__header" style={{ width: "20%" }}>
              SimDPG system
            </th>
            <th className="govuk-table__header" style={{ width: "16%" }}>
              Status
            </th>
            <th className="govuk-table__header">Notes</th>
          </tr>
        </thead>
        <tbody>
          {systems.map((sys) => (
            <tr key={`bb-${sys.id}`}>
              <td className="govuk-table__cell">{sys.buildingBlock}</td>
              <td className="govuk-table__cell">
                <a
                  href={`/staff/systems-catalog/${sys.id}`}
                  className="govuk-link"
                >
                  <strong>{sys.name}</strong>
                </a>
              </td>
              <td className="govuk-table__cell">
                <span
                  className={`govuk-tag ${STATUS_BADGE[sys.status].colour}`}
                  style={{ fontSize: "12px" }}
                >
                  {STATUS_BADGE[sys.status].label}
                </span>
              </td>
              <td className="govuk-table__cell">{sys.summary}</td>
            </tr>
          ))}
          <tr>
            <td className="govuk-table__cell">
              Information Mediator / Exchange
            </td>
            <td className="govuk-table__cell">
              <strong>OpenFn</strong>
            </td>
            <td className="govuk-table__cell">
              <span
                className="govuk-tag govuk-tag--blue"
                style={{ fontSize: "12px" }}
              >
                External
              </span>
            </td>
            <td className="govuk-table__cell">
              Played by OpenFn — the integration layer under test. Not a SimDPG
              system of record.
            </td>
          </tr>
        </tbody>
      </table>

      <h3 className="govuk-heading-m">Deliberately excluded (for now)</h3>
      <p className="govuk-body">
        The following building blocks were considered and left out for now.
        They are not reintroduced as systems unless explicitly asked.
      </p>
      <ul className="govuk-list govuk-list--bullet">
        <li>
          <strong>Authentication / single sign-on</strong> — citizen and staff
          identity assurance.
        </li>
        <li>
          <strong>Consent / data-sharing</strong> — authorisation for
          cross-system data access.
        </li>
        <li>
          <strong>Document / credential issuance</strong> — issuing
          certificates, IDs, or credentials.
        </li>
      </ul>

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">All webhook events</h2>
      <p className="govuk-body">
        Complete list of webhook events emitted across all systems. These events
        are the integration points that OpenFn workflows subscribe to.
      </p>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header">Event</th>
            <th className="govuk-table__header">System</th>
            <th className="govuk-table__header">Description</th>
          </tr>
        </thead>
        <tbody>
          {systems.flatMap((system) =>
            system.webhooks.map((wh) => (
              <tr key={`${system.id}-${wh.event}`}>
                <td className="govuk-table__cell">
                  <code>{wh.event}</code>
                </td>
                <td className="govuk-table__cell">
                  <a
                    href={`/staff/systems-catalog/${system.id}`}
                    className="govuk-link"
                  >
                    <strong>{system.name}</strong>
                  </a>
                  {system.sketch && (
                    <span
                      className="govuk-tag govuk-tag--yellow"
                      style={{ fontSize: "11px", marginLeft: "8px" }}
                    >
                      Proposed
                    </span>
                  )}
                </td>
                <td className="govuk-table__cell">{wh.description}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>

      <p className="govuk-body-s" style={{ marginTop: "30px" }}>
        <a href="/staff" className="govuk-link">
          Back to staff dashboard
        </a>
      </p>
    </>
  );
}
