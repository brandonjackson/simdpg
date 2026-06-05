"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

interface Citizen {
  id: string;
  national_id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string;
  sex: string;
  email: string | null;
  phone_number: string | null;
  status: string;
  date_of_death: string | null;
  addresses?: {
    type: string;
    line_1: string;
    line_2?: string;
    city: string;
    postal_code: string;
  }[];
}

interface TimelineEvent {
  date: string;
  type: string;
  system: string;
  summary: string;
  details: Record<string, unknown>;
}

interface Enrollment {
  id: string;
  program_name?: string;
  status: string;
  enrolled_at: string;
  terminated_at: string | null;
}

export default function CitizenTimeline() {
  const params = useParams();
  const id = params.id as string;

  const [citizen, setCitizen] = useState<Citizen | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const events: TimelineEvent[] = [];

    try {
      const citizenRes = await fetch(`/api/proxy/identity/citizens/${id}`);
      if (!citizenRes.ok) {
        setError("Citizen not found");
        setLoading(false);
        return;
      }
      const citizenData = await citizenRes.json();
      setCitizen(citizenData);

      events.push({
        date: citizenData.created_at?.split("T")[0] || citizenData.date_of_birth,
        type: "registered",
        system: "Identity",
        summary: "Citizen registered in identity system",
        details: { national_id: citizenData.national_id },
      });
    } catch {
      setError("Identity system unavailable");
      setLoading(false);
      return;
    }

    try {
      const eventsRes = await fetch(
        `/api/proxy/civil-registry/events?citizen_id=${id}`
      );
      if (eventsRes.ok) {
        const vitalEvents = await eventsRes.json();
        for (const evt of vitalEvents) {
          events.push({
            date: evt.date,
            type: evt.type,
            system: "Civil Registry",
            summary:
              evt.type === "birth"
                ? "Birth registered"
                : evt.type === "death"
                  ? "Death registered"
                  : "Marriage registered",
            details: evt.details || {},
          });
        }
      }
    } catch {
      // Civil registry unavailable
    }

    try {
      const patientRes = await fetch(
        `/api/proxy/health/patients?citizen_id=${id}`
      );
      if (patientRes.ok) {
        const patients = await patientRes.json();
        const patient = Array.isArray(patients) ? patients[0] : patients;
        if (patient) {
          events.push({
            date: patient.registered_at?.split("T")[0] || "",
            type: "patient_registered",
            system: "Health",
            summary: "Registered as patient",
            details: { blood_type: patient.blood_type, patient_id: patient.id },
          });

          const encRes = await fetch(
            `/api/proxy/health/encounters?patient_id=${patient.id}`
          );
          if (encRes.ok) {
            const encounters = await encRes.json();
            for (const enc of encounters) {
              events.push({
                date: enc.date,
                type: `encounter_${enc.type}`,
                system: "Health",
                summary: `${enc.type.charAt(0).toUpperCase() + enc.type.slice(1)} at ${enc.facility}`,
                details: {
                  provider: enc.provider,
                  diagnosis: enc.diagnosis,
                  notes: enc.notes,
                  status: enc.status,
                },
              });
            }
          }

          const vacRes = await fetch(
            `/api/proxy/health/vaccinations?patient_id=${patient.id}`
          );
          if (vacRes.ok) {
            const vaccinations = await vacRes.json();
            for (const vac of vaccinations) {
              events.push({
                date: vac.date_administered,
                type: "vaccination",
                system: "Health",
                summary: `${vac.vaccine_name} dose ${vac.dose_number}`,
                details: {
                  batch_number: vac.batch_number,
                  next_dose_due: vac.next_dose_due,
                },
              });
            }
          }
        }
      }
    } catch {
      // Health system unavailable
    }

    try {
      const enrollRes = await fetch(
        `/api/proxy/benefits/enrollments?citizen_id=${id}`
      );
      if (enrollRes.ok) {
        const enrollmentData = await enrollRes.json();
        setEnrollments(enrollmentData);
        for (const enr of enrollmentData) {
          events.push({
            date: enr.enrolled_at?.split("T")[0] || "",
            type: "enrollment",
            system: "Benefits",
            summary: `Enrolled in ${enr.program_name || "program"}`,
            details: { status: enr.status, enrollment_id: enr.id },
          });
          if (enr.terminated_at) {
            events.push({
              date: enr.terminated_at.split("T")[0],
              type: "enrollment_terminated",
              system: "Benefits",
              summary: `Enrollment terminated: ${enr.program_name || "program"}`,
              details: { reason: enr.termination_reason, enrollment_id: enr.id },
            });
          }
        }
      }
    } catch {
      // Benefits system unavailable
    }

    try {
      const notifRes = await fetch(
        `/api/proxy/notifications/notifications?citizen_id=${id}`
      );
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        for (const n of notifData) {
          events.push({
            date: n.created_at?.split("T")[0] || "",
            type: "notification",
            system: "Notifications",
            summary: `${n.channel === "sms" ? "SMS" : "Email"} — ${n.subject || n.body.slice(0, 50)}`,
            details: { channel: n.channel, destination: n.destination, status: n.status, source: n.source_system },
          });
        }
      }
    } catch {
      // Notifications system unavailable
    }

    events.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    setTimeline(events);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const systemColor: Record<string, string> = {
    Identity: "govuk-tag--blue",
    "Civil Registry": "govuk-tag--purple",
    Health: "govuk-tag--green",
    Benefits: "govuk-tag--yellow",
    Notifications: "govuk-tag--grey",
  };

  if (loading) {
    return (
      <div>
        <a href="/staff/search" className="govuk-back-link">Back</a>
        <h1 className="govuk-heading-xl">Loading citizen record...</h1>
      </div>
    );
  }

  if (error || !citizen) {
    return (
      <div>
        <a href="/staff/search" className="govuk-back-link">Back</a>
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title">Error</h2>
          <ul className="govuk-error-summary__list">
            <li>{error || "Citizen not found"}</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <>
      <nav className="govuk-breadcrumbs" aria-label="Breadcrumb">
        <ol className="govuk-breadcrumbs__list">
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/">Home</a>
          </li>
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/staff">Staff area</a>
          </li>
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/staff/search">Search</a>
          </li>
          <li className="govuk-breadcrumbs__list-item">
            {citizen.given_name} {citizen.family_name}
          </li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">
        {citizen.given_name} {citizen.family_name}
        <span
          className={`govuk-tag ${citizen.status === "alive" ? "govuk-tag--green" : "govuk-tag--grey"}`}
          style={{ marginLeft: "16px", verticalAlign: "middle" }}
        >
          {citizen.status}
        </span>
      </h1>

      <dl className="govuk-summary-list">
        <div className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">National ID</dt>
          <dd className="govuk-summary-list__value">{citizen.national_id}</dd>
        </div>
        <div className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">Date of birth</dt>
          <dd className="govuk-summary-list__value">{citizen.date_of_birth}</dd>
        </div>
        <div className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">Sex</dt>
          <dd className="govuk-summary-list__value">
            {citizen.sex.charAt(0).toUpperCase() + citizen.sex.slice(1)}
          </dd>
        </div>
        {citizen.email && (
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Email</dt>
            <dd className="govuk-summary-list__value">{citizen.email}</dd>
          </div>
        )}
        {citizen.phone_number && (
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Phone</dt>
            <dd className="govuk-summary-list__value">{citizen.phone_number}</dd>
          </div>
        )}
        {citizen.date_of_death && (
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Date of death</dt>
            <dd className="govuk-summary-list__value">{citizen.date_of_death}</dd>
          </div>
        )}
        {citizen.addresses && citizen.addresses.length > 0 && (
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Address</dt>
            <dd className="govuk-summary-list__value">
              {citizen.addresses[0].line_1}
              {citizen.addresses[0].line_2 ? `, ${citizen.addresses[0].line_2}` : ""}
              <br />
              {citizen.addresses[0].city}, {citizen.addresses[0].postal_code}
            </dd>
          </div>
        )}
      </dl>

      {enrollments.length > 0 && (
        <>
          <h2 className="govuk-heading-l">Benefit enrollments</h2>
          <table className="govuk-table">
            <thead>
              <tr>
                <th className="govuk-table__header">Program</th>
                <th className="govuk-table__header">Status</th>
                <th className="govuk-table__header">Enrolled</th>
                <th className="govuk-table__header">Terminated</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => (
                <tr key={e.id}>
                  <td className="govuk-table__cell">{e.program_name || "-"}</td>
                  <td className="govuk-table__cell">
                    <span
                      className={`govuk-tag ${
                        e.status === "active"
                          ? "govuk-tag--green"
                          : e.status === "terminated"
                            ? "govuk-tag--red"
                            : "govuk-tag--yellow"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="govuk-table__cell">
                    {e.enrolled_at?.split("T")[0] || "-"}
                  </td>
                  <td className="govuk-table__cell">
                    {e.terminated_at?.split("T")[0] || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className="govuk-heading-l">Timeline</h2>
      <p className="govuk-body-s govuk-hint">
        {timeline.length} event{timeline.length !== 1 ? "s" : ""} across all
        systems, newest first.
      </p>

      {timeline.length === 0 ? (
        <p className="govuk-body">No events recorded for this citizen.</p>
      ) : (
        <div className="govuk-timeline">
          {timeline.map((evt, i) => (
            <div key={i} className="govuk-timeline__event">
              <div className="govuk-timeline__date">{evt.date}</div>
              <div className="govuk-timeline__content">
                <span className={`govuk-tag ${systemColor[evt.system] || ""}`}>
                  {evt.system}
                </span>
                <h3
                  className="govuk-heading-s"
                  style={{ marginTop: "8px", marginBottom: "4px" }}
                >
                  {evt.summary}
                </h3>
                {Object.entries(evt.details).filter(([, v]) => v != null)
                  .length > 0 && (
                  <dl className="govuk-timeline__details">
                    {Object.entries(evt.details)
                      .filter(([, v]) => v != null)
                      .map(([key, value]) => (
                        <div key={key} className="govuk-timeline__detail">
                          <dt>{key.replace(/_/g, " ")}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                  </dl>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
