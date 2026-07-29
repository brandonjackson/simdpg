"use client";

import { useCallback, useEffect, useState } from "react";

interface CatalogEvent {
  event: string;
  description: string;
}

export interface CatalogSystem {
  id: string;
  name: string;
  events: CatalogEvent[];
}

interface Subscription {
  id: string;
  system: string;
  event_type: string;
  target_url: string;
  created_at: string;
  project_id?: string | null;
}

/**
 * Per-event delivery targets for one project. Every read and write carries the
 * project id, so switching project in the picker above swaps the whole list
 * rather than mixing another project's registrations in.
 */
export function WebhookRegistry({
  catalog,
  projectId,
}: {
  catalog: CatalogSystem[];
  projectId: string;
}) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Draft URL per event, keyed by `${system}:${event}`.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Keys currently submitting an add/remove, to disable their controls.
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/webhooks?project_id=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) throw new Error(`Failed to load subscriptions (${res.status})`);
      const data = (await res.json()) as {
        subscriptions: Subscription[];
        errors: string[];
      };
      setSubscriptions(data.subscriptions);
      setUnavailable(data.errors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const keyFor = (system: string, event: string) => `${system}:${event}`;

  async function addTarget(system: string, event: string) {
    const key = keyFor(system, event);
    const target_url = (drafts[key] ?? "").trim();
    if (!target_url) return;

    setBusy((b) => ({ ...b, [key]: true }));
    setError(null);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system,
          event_type: event,
          target_url,
          project_id: projectId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error?.message ?? body?.error ?? `Could not register URL (${res.status})`,
        );
      }
      const created = (await res.json()) as Subscription;
      setSubscriptions((subs) => [...subs, created]);
      setDrafts((d) => ({ ...d, [key]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register URL");
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  async function removeTarget(sub: Subscription) {
    setBusy((b) => ({ ...b, [sub.id]: true }));
    setError(null);
    try {
      const res = await fetch(
        `/api/webhooks?system=${encodeURIComponent(sub.system)}&id=${encodeURIComponent(sub.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`Could not remove URL (${res.status})`);
      setSubscriptions((subs) => subs.filter((s) => s.id !== sub.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove URL");
    } finally {
      setBusy((b) => ({ ...b, [sub.id]: false }));
    }
  }

  if (loading) {
    return <p className="govuk-body">Loading registered webhooks&hellip;</p>;
  }

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

      {unavailable.length > 0 && (
        <div className="govuk-inset-text">
          Could not reach: {unavailable.join(", ")}. Their existing
          subscriptions are not shown and new ones can&rsquo;t be saved until
          they&rsquo;re back.
        </div>
      )}

      {catalog.map((system) => (
        <section key={system.id}>
          <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
          <h2 className="govuk-heading-l">{system.name}</h2>

          {system.events.map((ev) => {
            const key = keyFor(system.id, ev.event);
            const targets = subscriptions.filter(
              (s) => s.system === system.id && s.event_type === ev.event,
            );
            return (
              <div key={ev.event} className="govuk-form-group">
                <h3 className="govuk-heading-s" style={{ marginBottom: "5px" }}>
                  <code>{ev.event}</code>
                </h3>
                <p className="govuk-hint" style={{ marginTop: 0 }}>
                  {ev.description}
                </p>

                {targets.length > 0 ? (
                  <table className="govuk-table">
                    <tbody>
                      {targets.map((sub) => (
                        <tr key={sub.id} className="govuk-table__row">
                          <td className="govuk-table__cell">
                            <code>{sub.target_url}</code>
                          </td>
                          <td
                            className="govuk-table__cell"
                            style={{ width: "1%", whiteSpace: "nowrap" }}
                          >
                            <button
                              type="button"
                              className="govuk-button govuk-button--warning"
                              style={{ marginBottom: 0 }}
                              disabled={busy[sub.id]}
                              onClick={() => void removeTarget(sub)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="govuk-body-s" style={{ color: "#505a5f" }}>
                    No URLs registered.
                  </p>
                )}

                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <input
                    className="govuk-input"
                    type="url"
                    placeholder="https://your-openfn-instance/i/<trigger-id>"
                    value={drafts[key] ?? ""}
                    disabled={unavailable.includes(system.id)}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [key]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addTarget(system.id, ev.event);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="govuk-button govuk-button--secondary"
                    style={{ marginBottom: 0, whiteSpace: "nowrap" }}
                    disabled={busy[key] || unavailable.includes(system.id)}
                    onClick={() => void addTarget(system.id, ev.event)}
                  >
                    Add URL
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
