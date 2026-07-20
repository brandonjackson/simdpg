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

/** Result of a "Test connection" attempt for a single form. */
interface TestResult {
  ok: boolean;
  /** Webhook status code (present on a successful relay). */
  status?: number;
  /** Webhook response body, verbatim. */
  body?: string;
  /** The URL the test payload was actually sent to. */
  url?: string;
  /** Error message when the relay failed or the webhook was unreachable. */
  error?: string;
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
  // Form key showing a transient "Saved" confirmation.
  const [savedKey, setSavedKey] = useState<string | null>(null);
  // "Test connection" panel state, keyed by form.
  const [testOpen, setTestOpen] = useState<Record<string, boolean>>({});
  const [testPayloads, setTestPayloads] = useState<Record<string, string>>({});
  const [testBusy, setTestBusy] = useState<Record<string, boolean>>({});
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

  // Toggle the test panel, seeding the editable payload with the sample the
  // first time it opens (so re-opening keeps any edits the user made).
  function toggleTest(key: string) {
    setTestPayloads((p) =>
      p[key] === undefined ? { ...p, [key]: getSamplePayloadJson(key) } : p,
    );
    setTestOpen((o) => ({ ...o, [key]: !o[key] }));
  }

  function resetPayload(key: string) {
    setTestPayloads((p) => ({ ...p, [key]: getSamplePayloadJson(key) }));
  }

  // POST the edited payload to the test endpoint, which relays it to the
  // webhook (using the URL currently typed, or the resolved one) and returns
  // the response. Nothing is saved.
  async function sendTest(key: string) {
    setTestBusy((b) => ({ ...b, [key]: true }));
    setTestResults((r) => {
      const next = { ...r };
      delete next[key];
      return next;
    });
    try {
      const typedUrl = (drafts[key] ?? "").trim();
      const res = await fetch("/api/form-webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          target_url: typedUrl || undefined,
          payload: testPayloads[key] ?? getSamplePayloadJson(key),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as TestResult & {
        error?: string;
      };
      if (!res.ok) {
        setTestResults((r) => ({
          ...r,
          [key]: {
            ok: false,
            error: data?.error ?? `Test failed (${res.status})`,
          },
        }));
      } else {
        setTestResults((r) => ({
          ...r,
          [key]: {
            ok: true,
            status: data.status,
            body: data.body,
            url: data.url,
          },
        }));
      }
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
                aria-expanded={Boolean(testOpen[form.key])}
                onClick={() => toggleTest(form.key)}
              >
                {testOpen[form.key] ? "Hide test" : "Test connection"}
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

            {testOpen[form.key] && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "15px",
                  borderLeft: "4px solid #1d70b8",
                  background: "#f3f2f1",
                }}
              >
                <p className="govuk-body-s" style={{ marginTop: 0 }}>
                  Sends this payload to{" "}
                  <code>{(drafts[form.key] ?? "").trim() || form.resolved_url || "the registered URL"}</code>{" "}
                  with the <code>X-SimDPG-Form: {form.key}</code> header. Nothing
                  is saved — edit the payload freely.
                </p>
                <label
                  className="govuk-label govuk-label--s"
                  htmlFor={`test-payload-${form.key}`}
                >
                  Sample payload
                </label>
                <textarea
                  id={`test-payload-${form.key}`}
                  className="govuk-textarea"
                  rows={10}
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
                    disabled={testBusy[form.key]}
                    onClick={() => resetPayload(form.key)}
                  >
                    Reset payload
                  </button>
                </div>

                {testResults[form.key] && (
                  <div style={{ marginTop: "10px" }}>
                    {testResults[form.key].ok ? (
                      <>
                        <p
                          className="govuk-body-s"
                          role="status"
                          style={{ marginBottom: "5px" }}
                        >
                          Response{" "}
                          <strong
                            style={{
                              color:
                                (testResults[form.key].status ?? 0) < 400
                                  ? "#00703c"
                                  : "#d4351c",
                            }}
                          >
                            {testResults[form.key].status}
                          </strong>{" "}
                          from <code>{testResults[form.key].url}</code>
                        </p>
                        <pre
                          className="govuk-body-s"
                          style={{
                            background: "#ffffff",
                            border: "1px solid #b1b4b6",
                            padding: "10px",
                            overflowX: "auto",
                            marginBottom: 0,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {testResults[form.key].body || "(empty response body)"}
                        </pre>
                      </>
                    ) : (
                      <p
                        className="govuk-body-s"
                        role="alert"
                        style={{ color: "#d4351c", marginBottom: 0 }}
                      >
                        {testResults[form.key].error}
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
