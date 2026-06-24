"use client";

import { useCallback, useEffect, useState } from "react";

interface FormHookStatus {
  key: string;
  service_id: string;
  name: string;
  description: string;
  /** Saved registry URL (null when only an env-var fallback is active). */
  target_url: string | null;
  /** URL submissions actually use right now. */
  resolved_url: string | null;
  source: "registry" | "env" | null;
  legacy_env_var: string | null;
}

/**
 * Staff control for pointing each portal form at a webhook URL. Unlike system
 * events (which fan out to many URLs), a form submits to exactly one webhook —
 * so each form has a single editable URL that can be set, replaced, or cleared.
 */
export function FormWebhookRegistry() {
  const [forms, setForms] = useState<FormHookStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Draft URL per form key.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/form-webhooks");
      if (!res.ok) throw new Error(`Failed to load form hooks (${res.status})`);
      const data = (await res.json()) as { forms: FormHookStatus[] };
      setForms(data.forms);
      setDrafts(
        Object.fromEntries(data.forms.map((f) => [f.key, f.target_url ?? ""])),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(key: string) {
    const target_url = (drafts[key] ?? "").trim();
    if (!target_url) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setError(null);
    try {
      const res = await fetch("/api/form-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, target_url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Could not save URL (${res.status})`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save URL");
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  async function clear(key: string) {
    setBusy((b) => ({ ...b, [key]: true }));
    setError(null);
    try {
      const res = await fetch(
        `/api/form-webhooks?key=${encodeURIComponent(key)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`Could not remove URL (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove URL");
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  if (loading) {
    return <p className="govuk-body">Loading registered forms&hellip;</p>;
  }

  return (
    <>
      {error && (
        <div className="govuk-error-summary" role="alert">
          <h2
            className="govuk-error-summary__title"
            style={{ fontSize: "18px" }}
          >
            There is a problem
          </h2>
          <p className="govuk-body" style={{ marginBottom: 0 }}>
            {error}
          </p>
        </div>
      )}

      {forms.map((form) => {
        const usingEnvFallback = form.source === "env";
        return (
          <div key={form.key} className="govuk-form-group">
            <h3 className="govuk-heading-s" style={{ marginBottom: "5px" }}>
              {form.name} <code>({form.key})</code>
            </h3>
            <p className="govuk-hint" style={{ marginTop: 0 }}>
              {form.description}
            </p>

            {usingEnvFallback && (
              <p className="govuk-body-s" style={{ color: "#505a5f" }}>
                Currently using the legacy <code>{form.legacy_env_var}</code>{" "}
                environment variable (<code>{form.resolved_url}</code>).
                Registering a URL below overrides it.
              </p>
            )}

            <div
              style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}
            >
              <input
                className="govuk-input"
                type="url"
                placeholder="https://your-openfn-instance/i/<trigger-id>"
                value={drafts[form.key] ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [form.key]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void save(form.key);
                  }
                }}
              />
              <button
                type="button"
                className="govuk-button govuk-button--secondary"
                style={{ marginBottom: 0, whiteSpace: "nowrap" }}
                disabled={busy[form.key]}
                onClick={() => void save(form.key)}
              >
                Save URL
              </button>
              {form.target_url && (
                <button
                  type="button"
                  className="govuk-button govuk-button--warning"
                  style={{ marginBottom: 0, whiteSpace: "nowrap" }}
                  disabled={busy[form.key]}
                  onClick={() => void clear(form.key)}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
