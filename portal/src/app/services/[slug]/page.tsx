import { SERVICES } from "@/lib/service-registry";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return SERVICES.filter((s) => s.href.startsWith("/services/")).map((s) => ({
    slug: s.id,
  }));
}

export default async function ServiceStub({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = SERVICES.find((s) => s.id === slug);
  if (!service) notFound();

  return (
    <>
      <nav className="govuk-breadcrumbs" aria-label="Breadcrumb">
        <ol className="govuk-breadcrumbs__list">
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/">
              Home
            </a>
          </li>
          <li className="govuk-breadcrumbs__list-item">{service.name}</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">{service.name}</h1>
      <p className="govuk-body-l">{service.description}</p>

      <div className="govuk-inset-text">
        This service is under construction. The checklist below shows the
        current build status.
      </div>

      <h2 className="govuk-heading-m">Build status</h2>
      <ul className="govuk-task-list">
        <li className="govuk-task-list__item">
          <span className="govuk-task-list__name">
            <a
              href={`/staff/service-catalog#${service.id}`}
              className="govuk-link"
            >
              Spec written
            </a>
          </span>
          <span className="govuk-task-list__status govuk-task-list__status--completed">
            Completed
          </span>
        </li>
        <li className="govuk-task-list__item">
          <span className="govuk-task-list__name">
            Build the user form on the portal
          </span>
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
            Connect the form to the systems using an OpenFn workflow
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

      <h2 className="govuk-heading-m">About this service</h2>
      <h3 className="govuk-heading-s">Customer journey</h3>
      <ol className="govuk-body" style={{ paddingLeft: "20px" }}>
        {service.customerJourney.map((step, i) => (
          <li key={i} style={{ marginBottom: "8px" }}>
            {step}
          </li>
        ))}
      </ol>

      <h3 className="govuk-heading-s">Systems involved</h3>
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

      <p className="govuk-body" style={{ marginTop: "30px" }}>
        <a href="/" className="govuk-link">
          Back to services
        </a>
        {" | "}
        <a
          href={`/staff/service-catalog#${service.id}`}
          className="govuk-link"
        >
          View full spec in service catalog
        </a>
      </p>
    </>
  );
}
