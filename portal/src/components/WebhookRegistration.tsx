"use client";

import { useCallback, useEffect, useState } from "react";
import { WebhookRegistry, type CatalogSystem } from "./WebhookRegistry";
import { FormWebhookRegistry } from "./FormWebhookRegistry";
import type { ProjectSummary } from "./ProjectManager";

/** Remembers the project last worked on, so a reload lands back on it. */
const STORAGE_KEY = "simdpg.webhooks.project";

interface ProjectsResponse {
  projects: ProjectSummary[];
  default_project_id: string | null;
  error?: string;
}

/**
 * The whole webhook registration screen, scoped to one project.
 *
 * Registrations belong to a project (see `lib/projects`), so the project picker
 * has to come first: everything below it — form-submission URLs and system-event
 * subscriptions — is read and written for the selected project alone. The
 * initial selection comes from `?project=<id>` (how the projects page links
 * here), then the last project used in this browser, then the default project.
 */
export function WebhookRegistration({ catalog }: { catalog: CatalogSystem[] }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = (await res.json()) as ProjectsResponse;
      if (!res.ok) throw new Error(data.error ?? "Could not load projects");
      const list = data.projects ?? [];
      setProjects(list);

      const known = (id: string | null): string | null =>
        id && list.some((p) => p.id === id) ? id : null;
      const fromUrl = new URLSearchParams(window.location.search).get("project");
      const remembered = window.localStorage.getItem(STORAGE_KEY);
      setProjectId(
        known(fromUrl) ??
          known(remembered) ??
          known(data.default_project_id) ??
          list[0]?.id ??
          null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function select(id: string) {
    setProjectId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Private-browsing / storage-disabled: the selection just isn't remembered.
    }
  }

  if (loading) return <p className="govuk-body">Loading projects&hellip;</p>;

  if (error || !projectId) {
    return (
      <div className="govuk-error-summary" role="alert">
        <h2 className="govuk-error-summary__title" style={{ fontSize: "18px" }}>
          There is a problem
        </h2>
        <p className="govuk-body" style={{ marginBottom: 0 }}>
          {error ??
            "No project is registered yet — add one on the Projects page first."}
        </p>
      </div>
    );
  }

  const project = projects.find((p) => p.id === projectId);

  return (
    <>
      <div className="govuk-form-group">
        <label className="govuk-label govuk-label--m" htmlFor="webhook-project">
          Project
        </label>
        <div className="govuk-hint">
          Which set of webhook URLs you&rsquo;re editing. Each project normally
          maps to one OpenFn project, so a cloned OpenFn project gets its own
          entry here.
        </div>
        <select
          className="govuk-select"
          id="webhook-project"
          value={projectId}
          onChange={(e) => select(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
        <p className="govuk-body-s" style={{ marginTop: "10px" }}>
          <a className="govuk-link" href="/staff/projects">
            Add, duplicate, rename or delete projects
          </a>
        </p>
      </div>

      {project?.isDefault && (
        <div className="govuk-inset-text">
          This is the default project, so live citizen-facing form submissions
          from the portal are sent to the URLs below.
        </div>
      )}

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">Form submissions</h2>
      <p className="govuk-body">
        Choose where each portal form is submitted for{" "}
        <strong>{project?.name ?? "this project"}</strong>. Every service form
        posts to a central point in the portal, which forwards the submission to
        the URL you register here &mdash; so you can wire a form to a workflow
        without redeploying. Each form submits to a single webhook per project and
        waits for its reply. Simulations deliver their generated events to these
        same URLs, for whichever project the run was started against.
      </p>
      <div className="govuk-inset-text">
        The form payload is POSTed unchanged, with the form&rsquo;s key in an{" "}
        <code>X-SimDPG-Form</code> header. Forms that were previously configured
        with an <code>OPENFN_*</code> environment variable keep using it in the
        default project until a URL is registered there, which then takes
        precedence.
      </div>

      <FormWebhookRegistry projectId={projectId} />

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <h2 className="govuk-heading-l">System events</h2>
      <p className="govuk-body">
        When a system emits an event, it is delivered to every URL registered for
        that event type &mdash; so a single event can fan out to several
        workflows. URLs added here are recorded against{" "}
        <strong>{project?.name ?? "this project"}</strong>, which is how they are
        listed and removed.
      </p>
      <div className="govuk-inset-text">
        <p className="govuk-body">
          Each event is delivered as a DCI/CloudEvents envelope
          (<code>{`{ id, type, source, time, data }`}</code>) by HTTP POST. The
          legacy <code>WEBHOOK_URL</code> environment variable, if set on a
          system, still receives every event as an additional catch-all target.
        </p>
        <p className="govuk-body" style={{ marginBottom: 0 }}>
          Unlike form submissions, system events are <strong>not</strong> confined
          to one project: a system emits an event when its own records change and
          can&rsquo;t tell which project&rsquo;s workflow caused the change, so
          every registered URL for that event type is called, across all projects.
          Register an event in one project only if you want a single consumer.
        </p>
      </div>

      <WebhookRegistry catalog={catalog} projectId={projectId} />
    </>
  );
}
