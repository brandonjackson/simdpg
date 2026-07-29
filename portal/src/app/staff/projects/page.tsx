import { ProjectManager } from "@/components/ProjectManager";

export const dynamic = "force-dynamic";

export default function ProjectsPage() {
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
          <li className="govuk-breadcrumbs__list-item">Projects</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Projects</h1>
      <p className="govuk-body-l">
        A project is one set of webhook URLs &mdash; normally one OpenFn project.
        Register a project for each OpenFn project you&rsquo;ve cloned, fill in
        its URLs on the <a className="govuk-link" href="/staff/webhooks">Webhook
        registration</a> page, then choose the project when you start a simulation
        so its results land in that OpenFn project.
      </p>

      <div className="govuk-inset-text">
        One project is the <strong>default</strong>: live citizen-facing form
        submissions from the portal go to it, since a citizen filling in a form
        has no project to choose. Simulations always name their project
        explicitly.
      </div>

      <ProjectManager />

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
      <p className="govuk-body-s">
        <a href="/staff" className="govuk-link">
          Back to staff dashboard
        </a>
      </p>
    </>
  );
}
