"use client";

import { useMemo, useState } from "react";
import type { SystemEndpoint } from "@/lib/systems-registry";

interface ApiSandboxProps {
  /** Proxy key for the system (matches /api/proxy/<systemId>). */
  systemId: string;
  systemName: string;
  port: number;
  endpoints: SystemEndpoint[];
  /** True for stub/sketch systems that have no running service. */
  disabled?: boolean;
}

interface ApiResponse {
  status: number;
  statusText: string;
  durationMs: number;
  requestId: string | null;
  contentType: string;
  body: string;
  ok: boolean;
}

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

/** Split a documented path (which may include a query string) into pieces. */
function parseEndpointPath(path: string): { path: string; query: string } {
  const [p, q] = path.split("?");
  return { path: p, query: q ?? "" };
}

/** Best-effort request-body template so POST/PATCH endpoints aren't blank. */
function bodyTemplateFor(endpoint: SystemEndpoint | null): string {
  if (!endpoint) return "";
  if (endpoint.method === "GET" || endpoint.method === "DELETE") return "";
  // Leave a minimal, well-formed JSON object the user can fill in.
  return "{\n  \n}";
}

export default function ApiSandbox({
  systemId,
  systemName,
  port,
  endpoints,
  disabled = false,
}: ApiSandboxProps) {
  const CUSTOM = "__custom__";

  const [selected, setSelected] = useState<string>(
    endpoints.length > 0 ? "0" : CUSTOM,
  );
  const [method, setMethod] = useState<string>(endpoints[0]?.method ?? "GET");
  const [path, setPath] = useState<string>(endpoints[0]?.path ?? "/");
  const [body, setBody] = useState<string>(bodyTemplateFor(endpoints[0] ?? null));
  const [requestId, setRequestId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  const hasBody = method !== "GET" && method !== "DELETE";

  // Show the unmodified path so users see where to substitute :id, X, etc.
  const placeholderHints = useMemo(() => {
    const hints: string[] = [];
    if (path.includes(":")) hints.push("replace :params with real IDs");
    if (/=(X|DATE|Y)?(&|$)/.test(path) || path.includes("?"))
      hints.push("fill in query values after =");
    return hints;
  }, [path]);

  function applyEndpoint(value: string) {
    setSelected(value);
    setResponse(null);
    setError(null);
    if (value === CUSTOM) return;
    const ep = endpoints[Number(value)];
    if (!ep) return;
    setMethod(ep.method);
    setPath(ep.path);
    setBody(bodyTemplateFor(ep));
  }

  async function sendRequest() {
    setLoading(true);
    setError(null);
    setResponse(null);

    // The documented path may carry a query string; the proxy forwards it as-is.
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `/api/proxy/${systemId}${cleanPath}`;

    const headers: Record<string, string> = {};
    if (hasBody) headers["Content-Type"] = "application/json";
    const trimmedRequestId = requestId.trim();
    if (trimmedRequestId) headers["X-Request-ID"] = trimmedRequestId;

    const init: RequestInit = { method, headers };
    if (hasBody && body.trim()) {
      // Validate JSON client-side so the user gets a clear message.
      try {
        JSON.parse(body);
      } catch {
        setError("Request body is not valid JSON.");
        setLoading(false);
        return;
      }
      init.body = body;
    }

    const start = performance.now();
    try {
      const res = await fetch(url, init);
      const durationMs = Math.round(performance.now() - start);
      const text = await res.text();
      const contentType = res.headers.get("Content-Type") ?? "";

      let displayBody = text;
      if (contentType.includes("json") && text) {
        try {
          displayBody = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          /* leave raw text */
        }
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        durationMs,
        requestId: res.headers.get("X-Request-ID"),
        contentType: contentType || "—",
        body: displayBody,
        ok: res.ok,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Request failed — is the system running?",
      );
    } finally {
      setLoading(false);
    }
  }

  if (disabled) {
    return (
      <div className="govuk-inset-text">
        The interactive API sandbox is only available for built systems. {systemName}{" "}
        is a <strong>sketch</strong> — no service is running on{" "}
        <code>:{port}</code> yet, so its endpoints cannot be called.
      </div>
    );
  }

  function statusColour(status: number): string {
    if (status >= 200 && status < 300) return "govuk-tag--green";
    if (status >= 400 && status < 500) return "govuk-tag--yellow";
    if (status >= 500) return "govuk-tag--red";
    return "govuk-tag--blue";
  }

  return (
    <div className="api-sandbox">
      <p className="govuk-body">
        Send a live request to the {systemName} system (<code>:{port}</code>).
        Requests are proxied through the portal, so no CORS setup is needed.
        Pick a documented endpoint to pre-fill the form, or choose{" "}
        <strong>Custom request</strong> to craft your own.
      </p>

      <div className="govuk-form-group">
        <label className="govuk-label govuk-label--s" htmlFor={`ep-${systemId}`}>
          Endpoint
        </label>
        <select
          id={`ep-${systemId}`}
          className="govuk-select"
          value={selected}
          onChange={(e) => applyEndpoint(e.target.value)}
          style={{ maxWidth: "100%", width: "100%" }}
        >
          {endpoints.map((ep, i) => (
            <option key={`${ep.method}-${ep.path}`} value={String(i)}>
              {ep.method} {ep.path} — {ep.description}
            </option>
          ))}
          <option value={CUSTOM}>Custom request…</option>
        </select>
      </div>

      <div className="api-sandbox__request-line">
        <div className="govuk-form-group" style={{ marginBottom: 0 }}>
          <label
            className="govuk-label govuk-label--s"
            htmlFor={`method-${systemId}`}
          >
            Method
          </label>
          <select
            id={`method-${systemId}`}
            className="govuk-select"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div
          className="govuk-form-group"
          style={{ marginBottom: 0, flexGrow: 1 }}
        >
          <label
            className="govuk-label govuk-label--s"
            htmlFor={`path-${systemId}`}
          >
            Path
          </label>
          <div className="api-sandbox__path">
            <span className="api-sandbox__base">:{port}</span>
            <input
              id={`path-${systemId}`}
              className="govuk-input"
              type="text"
              value={path}
              spellCheck={false}
              onChange={(e) => setPath(e.target.value)}
            />
          </div>
        </div>
      </div>

      {placeholderHints.length > 0 && (
        <p className="govuk-body-s api-sandbox__hint">
          Tip: {placeholderHints.join("; ")}.
        </p>
      )}

      {hasBody && (
        <div className="govuk-form-group">
          <label
            className="govuk-label govuk-label--s"
            htmlFor={`body-${systemId}`}
          >
            Request body (JSON)
          </label>
          <textarea
            id={`body-${systemId}`}
            className="govuk-textarea api-sandbox__body"
            rows={8}
            spellCheck={false}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
      )}

      <details className="govuk-details">
        <summary className="govuk-details__summary">
          <span className="govuk-details__summary-text">
            Traceability — set an X-Request-ID (optional)
          </span>
        </summary>
        <div className="govuk-details__text">
          <p className="govuk-body-s">
            Every system honours an <code>X-Request-ID</code> header if supplied
            and echoes it back on the response. Leave blank to let the system
            mint one.
          </p>
          <input
            className="govuk-input govuk-input--width-20"
            type="text"
            placeholder="e.g. trace-12345"
            value={requestId}
            spellCheck={false}
            onChange={(e) => setRequestId(e.target.value)}
          />
        </div>
      </details>

      <button
        type="button"
        className="govuk-button"
        onClick={sendRequest}
        disabled={loading}
      >
        {loading ? "Sending…" : "Send request"}
      </button>

      {error && (
        <div className="govuk-error-summary" role="alert">
          <h3 className="govuk-error-summary__title" style={{ fontSize: "18px" }}>
            Request failed
          </h3>
          <p className="govuk-body" style={{ marginBottom: 0 }}>
            {error}
          </p>
          <p className="govuk-body-s" style={{ marginTop: "8px", marginBottom: 0 }}>
            Make sure the {systemName} system is running on <code>:{port}</code>{" "}
            (<code>npm run dev:systems</code>).
          </p>
        </div>
      )}

      {response && (
        <div className="api-sandbox__response">
          <h4 className="govuk-heading-s" style={{ marginBottom: "8px" }}>
            Response
          </h4>
          <p className="govuk-body-s api-sandbox__meta">
            <span
              className={`govuk-tag ${statusColour(response.status)}`}
              style={{ marginRight: "10px" }}
            >
              {response.status} {response.statusText}
            </span>
            <span style={{ marginRight: "16px" }}>{response.durationMs} ms</span>
            <span style={{ marginRight: "16px" }}>
              <strong>Content-Type:</strong> {response.contentType}
            </span>
            {response.requestId && (
              <span>
                <strong>X-Request-ID:</strong> <code>{response.requestId}</code>
              </span>
            )}
          </p>
          <pre className="api-sandbox__pre">
            <code>{response.body || "(empty body)"}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
