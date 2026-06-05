"use client";

import { useState } from "react";

interface NotificationRecord {
  id: string;
  citizen_id: string;
  channel: "email" | "sms";
  destination: string;
  subject: string | null;
  body: string;
  source_system: string;
  source_event: string | null;
  status: "pending" | "sent" | "delivered" | "failed";
  attempts: number;
  sent_at: string | null;
  delivered_at: string | null;
  failed_reason: string | null;
  created_at: string;
}

export default function MyNotifications() {
  const [nationalId, setNationalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<NotificationRecord[] | null>(null);
  const [citizenName, setCitizenName] = useState("");

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setNotifications(null);

    try {
      const citizenRes = await fetch(
        `/api/lookup?type=citizen&national_id=${encodeURIComponent(nationalId)}`
      );
      if (!citizenRes.ok) {
        const data = await citizenRes.json();
        throw new Error(data.error || "Citizen not found");
      }
      const citizen = await citizenRes.json();
      setCitizenName(`${citizen.given_name} ${citizen.family_name}`);

      const notifRes = await fetch(
        `/api/proxy/notifications/notifications?citizen_id=${encodeURIComponent(citizen.id)}`
      );
      if (!notifRes.ok) {
        throw new Error("Failed to fetch notifications");
      }
      const data = await notifRes.json();
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function statusTag(status: string) {
    const colors: Record<string, string> = {
      delivered: "govuk-tag--green",
      sent: "govuk-tag--blue",
      pending: "",
      failed: "govuk-tag--red",
    };
    return colors[status] ?? "";
  }

  function channelLabel(channel: string) {
    return channel === "sms" ? "SMS" : "Email";
  }

  return (
    <>
      <a href="/" className="govuk-back-link">
        Back
      </a>

      <nav className="govuk-breadcrumbs" aria-label="Breadcrumb">
        <ol className="govuk-breadcrumbs__list">
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/">
              Home
            </a>
          </li>
          <li className="govuk-breadcrumbs__list-item">My notifications</li>
        </ol>
      </nav>

      {!notifications && (
        <>
          <h1 className="govuk-heading-xl">My notifications</h1>
          <p className="govuk-body-l">
            View messages sent to you by government services, including
            confirmations, reminders, and updates.
          </p>
        </>
      )}

      {error && (
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title">There is a problem</h2>
          <ul className="govuk-error-summary__list">
            <li>{error}</li>
          </ul>
        </div>
      )}

      {!notifications && (
        <form onSubmit={handleLookup}>
          <div className="govuk-form-group">
            <label
              className="govuk-label govuk-label--l"
              htmlFor="citizen-nid"
            >
              Enter your national ID
            </label>
            <div className="govuk-hint">
              Your national identity number as it appears on your ID card.
            </div>
            <input
              className="govuk-input govuk-input--width-20"
              id="citizen-nid"
              type="text"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button className="govuk-button" type="submit" disabled={loading}>
            {loading ? "Loading..." : "View my notifications"}
          </button>
        </form>
      )}

      {notifications && (
        <>
          <h1 className="govuk-heading-xl">
            Notifications for {citizenName}
          </h1>

          {notifications.length === 0 ? (
            <p className="govuk-body">No notifications have been sent to you.</p>
          ) : (
            <>
              <p className="govuk-body">
                {notifications.length} notification{notifications.length !== 1 ? "s" : ""} found.
              </p>

              <table className="govuk-table">
                <thead>
                  <tr>
                    <th className="govuk-table__header">Date</th>
                    <th className="govuk-table__header">Channel</th>
                    <th className="govuk-table__header">Subject / Message</th>
                    <th className="govuk-table__header">System</th>
                    <th className="govuk-table__header">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={n.id}>
                      <td className="govuk-table__cell">
                        {new Date(n.created_at).toLocaleDateString()}
                      </td>
                      <td className="govuk-table__cell">
                        {channelLabel(n.channel)}
                        <br />
                        <span className="govuk-body-s" style={{ color: "#626a6e" }}>
                          {n.destination}
                        </span>
                      </td>
                      <td className="govuk-table__cell">
                        {n.subject && (
                          <strong>{n.subject}</strong>
                        )}
                        {n.subject && <br />}
                        {n.body.length > 120
                          ? n.body.slice(0, 120) + "..."
                          : n.body}
                      </td>
                      <td className="govuk-table__cell">
                        {n.source_system}
                      </td>
                      <td className="govuk-table__cell">
                        <span className={`govuk-tag ${statusTag(n.status)}`}>
                          {n.status}
                        </span>
                        {n.failed_reason && (
                          <p className="govuk-body-s" style={{ color: "#d4351c", marginTop: 4 }}>
                            {n.failed_reason}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

          <button
            className="govuk-button govuk-button--secondary"
            onClick={() => {
              setNotifications(null);
              setNationalId("");
              setCitizenName("");
            }}
          >
            Look up another citizen
          </button>
        </>
      )}
    </>
  );
}
