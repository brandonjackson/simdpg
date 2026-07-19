"use client";

import { useCallback, useEffect, useState } from "react";
import { getSamplePayloadJson } from "@/lib/form-sample-payloads";

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

/** Outcome of a "Test Connection" send, shown inline under the payload box. */
type TestResult =
  | {
      ok: true;
      url: string;
      status: number;
      statusText: string;
      body: string;
    }
  | { ok: false; error: string };

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
  // Form key showing a transient "Saved" confirmation.
  const [savedKey, setSavedKey] = useState<string | null>(null);
  // Form key whose "Test Connection" panel is open (only one at a time).
  const [testingKey, setTestingKey] = useState<string | null>(null);
  // Editable test payload per form key (seeded with a sample on first open).
  const [testPayloads, setTestPayloads] = useState<Record<string, string>>({});
  // Whether a test request is in flight for a form key.
  const [testBusy, setTestBusy] = useState<Record<string, boolean>>({});
  // Last test result per form key (success response or error message).
  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    {},
  );

  // Fetch the catalog + current registrations. `withSpinner` is true only on
  // initial mount; mutations refresh quietly so the section doesn't blank out.
  const refresh = useCallback(async (withSpinner: boolean) => {
    if (withSpinner) setLoading(true);
    try {
      const res = await fetch("/api/form-webhooks");
      if (!res.ok) throw new Error(`Failed to load form hooks (${res.status})`);
      const data = (await res.json()) as { forms: FormHookStatus[] };
      setForms(data.forms);
      setDrafts((prev) =>
        Object.fromEntries(
          // Keep whatever the user has typed; only seed empty drafts.
          data.forms.map((f) => [f.key, prev[f.key] ?? f.target_url ?? ""]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  async function save(key: string) {
    const target_url = (drafts[key] ?? "").trim();
    if (!target_url) {
      setError("Enter a URL before saving.");
      return;
    }
    setBusy((b) => ({ ...b, [key]: true }));
    setError(null);
    setSavedKey(null);
    try {
      const res = await fetch("/api/form-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, target_url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? `Could not save URL (${res.status})`);
      }
      await refresh(false);
      setSavedKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save URL");
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  async function clear(key: string) {
    setBusy((b) => ({ ...b, [key]: true }));
    setError(null);
    setSavedKey(null);
    try {
      const res = await fetch(
        `/api/form-webhooks?key=${encodeURIComponent(key)}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? `Could not remove URL (${res.status})`);
      }
      // Drop the draft so the refreshed (possibly env-fallback) value shows.
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      await refresh(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove URL");
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  // Open/close the test panel for a form. On first open, seed the editable
  // payload with the form's sample so staff have a realistic starting point.
  function toggleTest(key: string) {
    setTestingKey((current) => (current === key ? null : key));
    setTestPayloads((p) =>
      key in p ? p : { ...p, [key]: getSamplePayloadJson(key) },
    );
  }

  async function sendTest(key: string) {
    // Test the URL currently typed in the input; the API falls back to the
    // resolved URL when this is empty.
    const target_url = (drafts[key] ?? "").trim();
    const payload = testPayloads[key] ?? getSamplePayloadJson(key);

    // Validate JSON client-side for an immediate, clear message.
    try {
      JSON.parse(payload);
    } catch {
      setTestResults((r) => ({
        ...r,
        [key]: { ok: false, error: "The payload is not valid JSON." },
      }));
      return;
    }

    setTestBusy((b) => ({ ...b, [key]: true }));
    setTestResults((r) => {
      const next = { ...r };
      delete next[key];
      return next;
    });
    try {
      const res = await fetch("/api/form-webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, target_url, payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setTestResults((r) => ({
          ...r,
          [key]: {
            ok: false,
            error: data?.error ?? `Test failed (${res.status})`,
          },
        }));
        return;
      }
      setTestResults((r) => ({
        ...r,
        [key]: {
          ok: true,
          url: data.url,
          status: data.status,
          statusText: data.statusText ?? "",
          body: data.body ?? "",
        },
      }));
    } catch (err) {
      setTestResults((r) => ({
        ...r,
        [key]: {
          ok: false,
          error: err instanceof Error ? err.message : "Test failed",
        },
      }));
    } finally {
      setTestBusy((b) => ({ ...b, [key]: false }));
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
        const testResult = testResults[form.key];
        return (
          <div key={form.key} className="govuk-form-group">
            <h3 className="govuk-heading-s" style={{ marginBottom: "5px" }}>
              {form.name} <code>({form.key})</code>
            </h3>
            <p className="govuk-hint" style={{ marginTop: 0 }}>
              {form.description}
            </p>

            {form.source === "registry" && (
              <p className="govuk-body-s" style={{ marginBottom: "5px" }}>
                Submissions are sent to <code>{form.resolved_url}</code>.
              </p>
            )}
            {usingEnvFallback && (
              <p className="govuk-body-s" style={{ color: "#505a5f" }}>
                Currently using the legacy <code>{form.legacy_env_var}</code>{" "}
                environment variable (<code>{form.resolved_url}</code>).
                Registering a URL below overrides it.
              </p>
            )}
            {!form.resolved_url && (
              <p className="govuk-body-s" style={{ color: "#505a5f" }}>
                No webhook registered &mdash; this form is not wired to a
                workflow yet.
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
                {busy[form.key] ? "Saving…" : "Save URL"}
              </button>
              <button
                type="button"
                className="govuk-button govuk-button--secondary"
                style={{ marginBottom: 0, whiteSpace: "nowrap" }}
                aria-expanded={testingKey === form.key}
                onClick={() => toggleTest(form.key)}
              >
                {testingKey === form.key ? "Hide test" : "Test connection"}
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

            {savedKey === form.key && (
              <p
                className="govuk-body-s"
                role="status"
                style={{ color: "#00703c", marginTop: "5px", marginBottom: 0 }}
              >
                ✓ Saved.
              </p>
            )}

            {testingKey === form.key && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "15px",
                  borderLeft: "5px solid #b1b4b6",
                  background: "#f3f2f1",
                }}
              >
                <p className="govuk-body-s" style={{ marginBottom: "5px" }}>
                  Send a sample payload to{" "}
                  <code>
                    {(drafts[form.key] ?? "").trim() ||
                      form.resolved_url ||
                      "the URL above"}
                  </code>
                  . Edit the JSON below, then Send. The payload is POSTed exactly
                  as a real submission (with the <code>X-SimDPG-Form</code>{" "}
                  header) &mdash; nothing is saved.
                </p>
                <label
                  className="govuk-label govuk-label--s"
                  htmlFor={`test-payload-${form.key}`}
                >
                  Sample payload (JSON)
                </label>
                <textarea
                  id={`test-payload-${form.key}`}
                  className="govuk-textarea"
                  rows={8}
                  spellCheck={false}
                  style={{ fontFamily: "monospace", marginBottom: "10px" }}
                  value={testPayloads[form.key] ?? ""}
                  onChange={(e) =>
                    setTestPayloads((p) => ({
                      ...p,
                      [form.key]: e.target.value,
                    }))
                  }
                />
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className="govuk-button"
                    style={{ marginBottom: 0, whiteSpace: "nowrap" }}
                    disabled={testBusy[form.key]}
                    onClick={() => void sendTest(form.key)}
                  >
                    {testBusy[form.key] ? "Sending…" : "Send"}
                  </button>
                  <button
                    type="button"
                    className="govuk-button govuk-button--secondary"
                    style={{ marginBottom: 0, whiteSpace: "nowrap" }}
                    onClick={() =>
                      setTestPayloads((p) => ({
                        ...p,
                        [form.key]: getSamplePayloadJson(form.key),
                      }))
                    }
                  >
                    Reset payload
                  </button>
                </div>

                {testResult && (
                  <div style={{ marginTop: "15px" }} role="status">
                    {testResult.ok ? (
                      <>
                        <p
                          className="govuk-body-s"
                          style={{
                            marginBottom: "5px",
                            fontWeight: "bold",
                            color: testResult.status < 400 ? "#00703c" : "#d4351c",
                          }}
                        >
                          Response: {testResult.status} {testResult.statusText}
                        </p>
                        <pre
                          className="govuk-body-s"
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            background: "#ffffff",
                            border: "1px solid #b1b4b6",
                            padding: "10px",
                            margin: 0,
                            maxHeight: "300px",
                            overflow: "auto",
                          }}
                        >
                          {testResult.body || "(empty response body)"}
                        </pre>
                      </>
                    ) : (
                      <p
                        className="govuk-body-s"
                        style={{ color: "#d4351c", marginBottom: 0 }}
                      >
                        ✗ {testResult.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
