"use client";

import { useCallback, useEffect, useState } from "react";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  webhookCount: number;
}

interface ProjectsResponse {
  projects: ProjectSummary[];
  default_project_id: string | null;
  error?: string;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

/**
 * Staff control for the set of projects webhook registrations belong to: add a
 * project, duplicate one (copying its form-submission URLs, the fast path after
 * cloning an OpenFn project), rename it, choose which one live portal forms use,
 * and delete it along with its registrations.
 */
export function ProjectManager() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New-project form.
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [duplicateOf, setDuplicateOf] = useState("");
  const [creating, setCreating] = useState(false);

  // Id of the project being renamed, and the draft name.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // Id of the project awaiting delete confirmation.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (withSpinner: boolean) => {
    if (withSpinner) setLoading(true);
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = (await res.json()) as ProjectsResponse;
      if (!res.ok) throw new Error(data.error ?? "Could not load projects");
      setProjects(data.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load projects");
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  async function create() {
    if (!newName.trim()) {
      setError("Enter a project name.");
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          duplicate_of: duplicateOf || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        project?: ProjectSummary;
        error?: string;
      };
      if (!res.ok || !data.project) {
        throw new Error(data.error ?? `Could not create the project (${res.status})`);
      }
      setNotice(
        duplicateOf
          ? `Added “${data.project.name}” with ${data.project.webhookCount} copied form webhook${
              data.project.webhookCount === 1 ? "" : "s"
            }.`
          : `Added “${data.project.name}”.`,
      );
      setNewName("");
      setNewDescription("");
      setDuplicateOf("");
      await refresh(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project");
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>, success: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Could not update the project (${res.status})`);
      }
      setNotice(success);
      setRenamingId(null);
      await refresh(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the project");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(project: ProjectSummary) {
    setBusyId(project.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        new_default_id?: string | null;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Could not delete the project (${res.status})`);
      }
      setNotice(
        data.new_default_id
          ? `Deleted “${project.name}”. Another project is now the default for live portal forms.`
          : `Deleted “${project.name}” and its webhook registrations.`,
      );
      setConfirmingId(null);
      await refresh(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the project");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="govuk-body">Loading projects&hellip;</p>;

  return (
    <>
      {error && (
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title" style={{ fontSize: "18px" }}>
            There is a problem
          </h2>
          <p className="govuk-body" style={{ marginBottom: 0 }}>
            {error}
          </p>
        </div>
      )}

      {notice && (
        <p
          className="govuk-body"
          role="status"
          style={{ color: "#00703c", fontWeight: 700 }}
        >
          ✓ {notice}
        </p>
      )}

      <table className="govuk-table">
        <thead className="govuk-table__head">
          <tr className="govuk-table__row">
            <th className="govuk-table__header">Project</th>
            <th className="govuk-table__header">Form webhooks</th>
            <th className="govuk-table__header">Created</th>
            <th className="govuk-table__header">Actions</th>
          </tr>
        </thead>
        <tbody className="govuk-table__body">
          {projects.map((project) => {
            const busy = busyId === project.id;
            return (
              <tr key={project.id} className="govuk-table__row">
                <td className="govuk-table__cell">
                  {renamingId === project.id ? (
                    <div style={{ display: "flex", gap: "10px" }}>
                      <input
                        className="govuk-input"
                        aria-label={`New name for ${project.name}`}
                        value={renameDraft}
                        autoFocus
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void patch(
                              project.id,
                              { name: renameDraft },
                              `Renamed to “${renameDraft.trim()}”.`,
                            );
                          }
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                      <button
                        type="button"
                        className="govuk-button"
                        style={{ marginBottom: 0, whiteSpace: "nowrap" }}
                        disabled={busy}
                        onClick={() =>
                          void patch(
                            project.id,
                            { name: renameDraft },
                            `Renamed to “${renameDraft.trim()}”.`,
                          )
                        }
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="govuk-button govuk-button--secondary"
                        style={{ marginBottom: 0 }}
                        onClick={() => setRenamingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <strong>{project.name}</strong>{" "}
                      {project.isDefault && (
                        <span className="govuk-tag govuk-tag--green">Default</span>
                      )}
                      {project.description && (
                        <>
                          <br />
                          <span className="govuk-body-s">{project.description}</span>
                        </>
                      )}
                    </>
                  )}
                </td>
                <td className="govuk-table__cell">{project.webhookCount}</td>
                <td className="govuk-table__cell">
                  <span className="govuk-body-s">{formatDate(project.createdAt)}</span>
                </td>
                <td className="govuk-table__cell">
                  <a
                    className="govuk-link"
                    href={`/staff/webhooks?project=${encodeURIComponent(project.id)}`}
                  >
                    Register webhooks
                  </a>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                      marginTop: "10px",
                    }}
                  >
                    <button
                      type="button"
                      className="govuk-button govuk-button--secondary"
                      style={{ marginBottom: 0 }}
                      disabled={busy}
                      onClick={() => {
                        setRenameDraft(project.name);
                        setRenamingId(project.id);
                        setConfirmingId(null);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="govuk-button govuk-button--secondary"
                      style={{ marginBottom: 0 }}
                      disabled={busy}
                      onClick={() => {
                        setDuplicateOf(project.id);
                        setNewName(`${project.name} copy`);
                        setNotice(
                          `Filling in the “Add a project” form below as a duplicate of “${project.name}”.`,
                        );
                      }}
                    >
                      Duplicate
                    </button>
                    {!project.isDefault && (
                      <button
                        type="button"
                        className="govuk-button govuk-button--secondary"
                        style={{ marginBottom: 0 }}
                        disabled={busy}
                        onClick={() =>
                          void patch(
                            project.id,
                            { is_default: true },
                            `“${project.name}” is now the default for live portal forms.`,
                          )
                        }
                      >
                        Make default
                      </button>
                    )}
                    {confirmingId === project.id ? (
                      <>
                        <button
                          type="button"
                          className="govuk-button govuk-button--warning"
                          style={{ marginBottom: 0 }}
                          disabled={busy}
                          onClick={() => void remove(project)}
                        >
                          {busy ? "Deleting…" : "Confirm delete"}
                        </button>
                        <button
                          type="button"
                          className="govuk-button govuk-button--secondary"
                          style={{ marginBottom: 0 }}
                          onClick={() => setConfirmingId(null)}
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="govuk-button govuk-button--warning"
                        style={{ marginBottom: 0 }}
                        disabled={busy || projects.length === 1}
                        title={
                          projects.length === 1
                            ? "The last project can't be deleted"
                            : undefined
                        }
                        onClick={() => setConfirmingId(project.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="govuk-heading-m">Add a project</h3>

      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor="project-name">
          Name
        </label>
        <div className="govuk-hint">
          How you&rsquo;ll recognise it when starting a simulation, e.g.
          &ldquo;Training run 3&rdquo; or the OpenFn project name.
        </div>
        <input
          className="govuk-input"
          id="project-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            }
          }}
        />
      </div>

      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor="project-description">
          Description (optional)
        </label>
        <input
          className="govuk-input"
          id="project-description"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
        />
      </div>

      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor="project-duplicate-of">
          Copy webhook URLs from
        </label>
        <div className="govuk-hint">
          Start from another project&rsquo;s form-submission URLs, then edit the
          ones the clone changed. System event subscriptions are not copied.
        </div>
        <select
          className="govuk-select"
          id="project-duplicate-of"
          value={duplicateOf}
          onChange={(e) => setDuplicateOf(e.target.value)}
        >
          <option value="">Nothing &mdash; start empty</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} ({project.webhookCount} webhook
              {project.webhookCount === 1 ? "" : "s"})
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="govuk-button"
        disabled={creating}
        onClick={() => void create()}
      >
        {creating ? "Adding…" : "Add project"}
      </button>
    </>
  );
}
