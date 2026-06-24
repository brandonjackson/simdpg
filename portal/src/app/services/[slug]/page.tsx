import { SERVICES } from "@/lib/service-registry";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  // Skip services that have their own dedicated route page (formBuilt === true);
  // otherwise this dynamic route pre-generates a stub that shadows the real form.
  return SERVICES.filter(
    (s) => s.href.startsWith("/services/") && !s.formBuilt,
  ).map((s) => ({
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
  // Services with a built form own their own dedicated route; never render the stub for them.
  if (service.formBuilt) notFound();

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

      <div className="govuk-inset-text">
        This service is under construction.
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

      <p className="govuk-body" style={{ marginTop: "30px" }}>
        <a href="/" className="govuk-link">
          Back to services
        </a>
      </p>
    </>
  );
}
