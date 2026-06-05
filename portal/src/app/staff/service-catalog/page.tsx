import { CATEGORIES, SERVICES, getServicesByCategory } from "@/lib/service-registry";
import CopyButton from "./CopyButton";

export default function ServiceCatalog() {
  const allWorkflows = SERVICES.flatMap((service) =>
    service.openfnWorkflows.map((wf) => ({ ...wf, serviceName: service.name, serviceId: service.id })),
  );

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
          <li className="govuk-breadcrumbs__list-item">Service catalog</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Service catalog</h1>
      <p className="govuk-body-l">
        Complete reference for all SimDPG government services. Each entry
        describes the citizen-facing journey, the backing systems, simulation
        behaviour, OpenFn workflows, and an AI-generation prompt ready to paste
        into OpenFn.
      </p>

      <div className="govuk-inset-text">
        <strong>Systems overview:</strong> SimDPG runs five live systems &mdash;{" "}
        <strong>Identity</strong> (:3001), <strong>Civil Registry</strong>{" "}
        (:3002), <strong>Health</strong> (:3003), <strong>Benefits</strong>{" "}
        (:3004), and <strong>Notifications</strong> (:3005) &mdash; plus two
        stubs: <strong>Payments</strong> (:3006) and{" "}
        <strong>Social Registry</strong> (:3007). Systems communicate via
        webhooks routed through OpenFn workflows.
      </div>

      {/* ── Quick-nav ── */}
      <h2 className="govuk-heading-m">Contents</h2>
      {CATEGORIES.map((cat) => {
        const services = getServicesByCategory(cat.id);
        if (services.length === 0) return null;
        return (
          <div key={cat.id} style={{ marginBottom: "15px" }}>
            <p className="govuk-body" style={{ marginBottom: "5px" }}>
              <strong>{cat.name}</strong>
            </p>
            <ul style={{ margin: 0, paddingLeft: "20px" }}>
              {services.map((s) => (
                <li key={s.id} style={{ fontSize: "16px", marginBottom: "2px" }}>
                  <a href={`#${s.id}`} className="govuk-link">
                    {s.name}
                  </a>
                  {!s.formBuilt && (
                    <span
                      className="govuk-tag govuk-tag--grey"
                      style={{ fontSize: "11px", marginLeft: "8px", verticalAlign: "middle" }}
                    >
                      Stub
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      {/* ── Service entries ── */}
      {SERVICES.map((service, index) => (
        <section key={service.id} id={service.id}>
          {index > 0 && (
            <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
          )}

          <h2 className="govuk-heading-l">
            {service.name}
            {!service.formBuilt && (
              <span
                className="govuk-tag govuk-tag--grey"
                style={{ fontSize: "14px", marginLeft: "12px", verticalAlign: "middle" }}
              >
                Stub
              </span>
            )}
          </h2>
          <p className="govuk-body-s" style={{ marginBottom: "5px" }}>
            <strong>DCI alignment:</strong> {service.dciAlignment}
          </p>
          <p className="govuk-body">{service.description}</p>

          {/* Build status */}
          <h3 className="govuk-heading-m">Build status</h3>
          <ul className="govuk-task-list">
            <li className="govuk-task-list__item">
              <span className="govuk-task-list__name">Spec written</span>
              <span className="govuk-task-list__status govuk-task-list__status--completed">
                Completed
              </span>
            </li>
            <li className="govuk-task-list__item">
              <span className="govuk-task-list__name">Portal form built</span>
              {service.formBuilt ? (
                <span className="govuk-task-list__status govuk-task-list__status--completed">
                  Completed
                </span>
              ) : (
                <span className="govuk-task-list__status govuk-task-list__status--not-started">
                  Not started
                </span>
              )}
            </li>
            <li className="govuk-task-list__item">
              <span className="govuk-task-list__name">
                Connected to OpenFn
              </span>
              {service.openfnConnected ? (
                <span className="govuk-task-list__status govuk-task-list__status--completed">
                  Completed
                </span>
              ) : (
                <span className="govuk-task-list__status govuk-task-list__status--not-started">
                  Not started
                </span>
              )}
            </li>
          </ul>

          {/* Customer journey */}
          <h3 className="govuk-heading-m">Customer journey</h3>
          <ol className="govuk-body" style={{ paddingLeft: "20px" }}>
            {service.customerJourney.map((step, i) => (
              <li key={i} style={{ marginBottom: "8px" }}>
                {step}
              </li>
            ))}
          </ol>

          {/* Systems */}
          <h3 className="govuk-heading-m">Systems</h3>
          <table className="govuk-table">
            <thead>
              <tr>
                <th className="govuk-table__header" style={{ width: "25%" }}>
                  System
                </th>
                <th className="govuk-table__header" style={{ width: "10%" }}>
                  Port
                </th>
                <th className="govuk-table__header">Role</th>
              </tr>
            </thead>
            <tbody>
              {service.systems.map((sys) => (
                <tr key={sys.name}>
                  <td className="govuk-table__cell">
                    <strong>{sys.name}</strong>
                  </td>
                  <td className="govuk-table__cell">
                    <code>:{sys.port}</code>
                  </td>
                  <td className="govuk-table__cell">{sys.role}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Simulation */}
          <h3 className="govuk-heading-m">Simulation</h3>
          {service.simulationNotes.map((note, i) => (
            <p className="govuk-body" key={i}>
              {note}
            </p>
          ))}

          {/* OpenFn workflows */}
          <h3 className="govuk-heading-m">OpenFn workflows</h3>
          {service.openfnWorkflows.map((wf) => (
            <div
              key={wf.name}
              style={{
                borderLeft: "5px solid #1d70b8",
                paddingLeft: "15px",
                marginBottom: "20px",
              }}
            >
              <p className="govuk-body" style={{ marginBottom: "5px" }}>
                <strong>{wf.name}</strong>
              </p>
              <p className="govuk-body-s" style={{ marginBottom: "5px" }}>
                <span
                  className={
                    wf.trigger.startsWith("Webhook")
                      ? "govuk-tag govuk-tag--blue"
                      : wf.trigger.startsWith("Scheduled")
                        ? "govuk-tag govuk-tag--green"
                        : "govuk-tag govuk-tag--grey"
                  }
                  style={{ fontSize: "12px", marginRight: "8px" }}
                >
                  {wf.trigger.startsWith("Webhook")
                    ? "Event-driven"
                    : wf.trigger.startsWith("Scheduled")
                      ? "Scheduled"
                      : "On-demand"}
                </span>
                {wf.trigger}
              </p>
              <p className="govuk-body" style={{ marginBottom: "0" }}>
                {wf.description}
              </p>
            </div>
          ))}

          {/* OpenFn prompt */}
          <h3 className="govuk-heading-m">OpenFn AI generation prompt</h3>
          <p className="govuk-body-s">
            Copy this prompt and paste it into OpenFn&apos;s AI workflow
            generator to produce a first draft of the integration workflow.
          </p>
          <CopyButton text={service.openfnPrompt} />
        </section>
      ))}

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      {/* ── Workflow summary table ── */}
      <h2 className="govuk-heading-l">Workflow summary</h2>
      <p className="govuk-body">
        All OpenFn workflows required across SimDPG services.
      </p>
      <table className="govuk-table">
        <thead>
          <tr>
            <th className="govuk-table__header">Workflow</th>
            <th className="govuk-table__header">Type</th>
            <th className="govuk-table__header">Trigger</th>
            <th className="govuk-table__header">Service</th>
          </tr>
        </thead>
        <tbody>
          {allWorkflows.map((wf) => (
            <tr key={`${wf.serviceId}-${wf.name}`}>
              <td className="govuk-table__cell">{wf.name}</td>
              <td className="govuk-table__cell">
                <span
                  className={
                    wf.trigger.startsWith("Webhook")
                      ? "govuk-tag govuk-tag--blue"
                      : wf.trigger.startsWith("Scheduled")
                        ? "govuk-tag govuk-tag--green"
                        : "govuk-tag govuk-tag--grey"
                  }
                  style={{ fontSize: "12px" }}
                >
                  {wf.trigger.startsWith("Webhook")
                    ? "Event-driven"
                    : wf.trigger.startsWith("Scheduled")
                      ? "Scheduled"
                      : "On-demand"}
                </span>
              </td>
              <td className="govuk-table__cell" style={{ fontSize: "16px" }}>
                {wf.trigger}
              </td>
              <td className="govuk-table__cell">
                <a href={`#${wf.serviceId}`} className="govuk-link">
                  {wf.serviceName}
                </a>
              </td>
            </tr>
          ))}
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
