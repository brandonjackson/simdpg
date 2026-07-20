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

/** Response from POST /api/form-webhooks/test. */
interface TestConnectionResult {
  ok?: boolean;
  status?: number;
  status_text?: string;
  content_type?: string;
  body?: string;
  duration_ms?: number;
  target_url?: string;
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

  // "Test connection" state, keyed by form.
  // Which form's test panel is currently open.
  const [testOpen, setTestOpen] = useState<Record<string, boolean>>({});
  // Editable sample payload the staff member is about to send.
  const [testPayload, setTestPayload] = useState<Record<string, string>>({});
  // Which form is mid-send.
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  // The most recent test result per form (success response or error).
  const [testResult, setTestResult] = useState<
    Record<string, TestConnectionResult>
  >({});

  // Open (or close) the test panel for a form, seeding the editable payload
  // with the form's sample the first time it is opened.
  function toggleTest(key: string) {
    setTestOpen((o) => {
      const next = { ...o, [key]: !o[key] };
      return next;
    });
    setTestPayload((p) =>
      p[key] === undefined ? { ...p, [key]: getSamplePayloadJson(key) } : p,
    );
  }

  // Restore the sample payload, discarding staff edits.
  function resetPayload(key: string) {
    setTestPayload((p) => ({ ...p, [key]: getSamplePayloadJson(key) }));
  }

  // Send the (edited) payload to the webhook via the server relay and show the
  // response inline. Uses the URL currently typed in the box so staff can test
  // before saving; the server falls back to the resolved URL if it is blank.
  async function sendTest(key: string) {
    let payload = testPayload[key];
    if (payload === undefined) payload = getSamplePayloadJson(key);
    // Validate JSON client-side for a fast, clear error.
    try {
      JSON.parse(payload);
    } catch {
      setTestResult((r) => ({
        ...r,
        [key]: { ok: false, error: "Payload is not valid JSON." },
      }));
      return;
    }
    setTesting((t) => ({ ...t, [key]: true }));
    setTestResult((r) => {
      const next = { ...r };
      delete next[key];
      return next;
    });
    try {
      const res = await fetch("/api/form-webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          payload,
          target_url: (drafts[key] ?? "").trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as TestConnectionResult;
      setTestResult((r) => ({ ...r, [key]: data }));
    } catch (err) {
      setTestResult((r) => ({
        ...r,
        [key]: {
          ok: false,
          error: err instanceof Error ? err.message : "Request failed.",
        },
      }));
    } finally {
      setTesting((t) => ({ ...t, [key]: false }));
    }
  }

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
                  borderLeft: "5px solid #1d70b8",
                  background: "#f3f2f1",
                }}
              >
                <p className="govuk-body-s" style={{ marginBottom: "5px" }}>
                  Send a sample payload to{" "}
                  <code>
                    {(drafts[form.key] ?? "").trim() ||
                      form.resolved_url ||
                      "the registered URL"}
                  </code>{" "}
                  and see the response. Edit the payload below if you like &mdash;
                  nothing is saved.
                </p>
                <label
                  className="govuk-label govuk-label--s"
                  htmlFor={`payload-${form.key}`}
                  style={{ marginBottom: "3px" }}
                >
                  Sample payload (JSON)
                </label>
                <textarea
                  id={`payload-${form.key}`}
                  className="govuk-textarea"
                  rows={10}
                  spellCheck={false}
                  style={{ fontFamily: "monospace", fontSize: "14px" }}
                  value={testPayload[form.key] ?? ""}
                  onChange={(e) =>
                    setTestPayload((p) => ({
                      ...p,
                      [form.key]: e.target.value,
                    }))
                  }
                />
                <div
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <button
                    type="button"
                    className="govuk-button"
                    style={{ marginBottom: 0, whiteSpace: "nowrap" }}
                    disabled={testing[form.key]}
                    onClick={() => void sendTest(form.key)}
                  >
                    {testing[form.key] ? "Sending…" : "Send"}
                  </button>
                  <button
                    type="button"
                    className="govuk-button govuk-button--secondary"
                    style={{ marginBottom: 0, whiteSpace: "nowrap" }}
                    disabled={testing[form.key]}
                    onClick={() => resetPayload(form.key)}
                  >
                    Reset payload
                  </button>
                </div>

                {testResult[form.key] && (
                  <TestResultView result={testResult[form.key]} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Inline display of a "Test connection" result: status line + response body. */
function TestResultView({ result }: { result: TestConnectionResult }) {
  // A network-level failure (couldn't reach the webhook / bad request).
  if (result.ok === false || (result.error && result.status === undefined)) {
    return (
      <div role="status" style={{ marginTop: "10px" }}>
        <p
          className="govuk-body-s"
          style={{ color: "#d4351c", fontWeight: 700, marginBottom: "5px" }}
        >
          ✗ {result.error ?? "Request failed."}
        </p>
      </div>
    );
  }

  const status = result.status ?? 0;
  const success = status >= 200 && status < 300;
  return (
    <div role="status" style={{ marginTop: "10px" }}>
      <p
        className="govuk-body-s"
        style={{
          color: success ? "#00703c" : "#d4351c",
          fontWeight: 700,
          marginBottom: "5px",
        }}
      >
        {success ? "✓" : "✗"} HTTP {status}
        {result.status_text ? ` ${result.status_text}` : ""}
        {typeof result.duration_ms === "number"
          ? ` · ${result.duration_ms} ms`
          : ""}
      </p>
      <p className="govuk-body-s" style={{ marginBottom: "3px" }}>
        Response body:
      </p>
      <pre
        style={{
          background: "#0b0c0c",
          color: "#f3f2f1",
          padding: "10px",
          overflowX: "auto",
          fontSize: "13px",
          margin: 0,
          maxHeight: "240px",
        }}
      >
        {result.body && result.body.length > 0
          ? result.body
          : "(empty response body)"}
      </pre>
    </div>
  );
}
