"use client";

import { useState } from "react";

interface CitizenRecord {
  citizen: {
    id: string;
    national_id: string;
    given_name: string;
    family_name: string;
    date_of_birth: string;
    sex: string;
    status: string;
    created_at: string;
  };
  vitalEvents: {
    type: string;
    date: string;
    id: string;
    details: Record<string, unknown>;
  }[];
  patient: {
    id: string;
    blood_type: string | null;
    allergies: string[] | null;
    status: string;
  } | null;
  encounters: {
    id: string;
    type: string;
    date: string;
    facility: string;
    provider: string;
    diagnosis: string | null;
    notes: string | null;
    status: string;
  }[];
  vaccinations: {
    id: string;
    vaccine_name: string;
    dose_number: number;
    date_administered: string;
    next_dose_due: string | null;
    batch_number: string;
  }[];
  enrollments: {
    id: string;
    program_id: string;
    program_name?: string;
    status: string;
    enrolled_at: string;
  }[];
  payments: {
    id: string;
    enrollment_id: string;
    amount: number;
    currency: string;
    status: string;
    scheduled_date: string;
    paid_date: string | null;
  }[];
}

export default function CheckMyRecord() {
  const [nationalId, setNationalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState<CitizenRecord | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setRecord(null);

    try {
      // Step 1: Look up citizen
      const citizenRes = await fetch(
        `/api/lookup?type=citizen&national_id=${encodeURIComponent(nationalId)}`
      );
      if (!citizenRes.ok) {
        const data = await citizenRes.json();
        throw new Error(data.error || "Citizen not found");
      }
      const citizen = await citizenRes.json();

      // Step 2: Fetch all data in parallel
      const [eventsRes, patientsRes, enrollmentsRes] = await Promise.allSettled(
        [
          fetch(
            `http://localhost:3002/events?citizen_id=${encodeURIComponent(citizen.id)}`
          ),
          fetch(
            `http://localhost:3003/patients?citizen_id=${encodeURIComponent(citizen.id)}`
          ),
          fetch(
            `http://localhost:3004/enrollments?citizen_id=${encodeURIComponent(citizen.id)}`
          ),
        ]
      );

      const vitalEvents =
        eventsRes.status === "fulfilled" && eventsRes.value.ok
          ? await eventsRes.value.json()
          : [];

      const patients =
        patientsRes.status === "fulfilled" && patientsRes.value.ok
          ? await patientsRes.value.json()
          : [];
      const patient = patients.length > 0 ? patients[0] : null;

      const enrollments =
        enrollmentsRes.status === "fulfilled" && enrollmentsRes.value.ok
          ? await enrollmentsRes.value.json()
          : [];

      // Step 3: If patient exists, fetch encounters and vaccinations
      let encounters: CitizenRecord["encounters"] = [];
      let vaccinations: CitizenRecord["vaccinations"] = [];
      if (patient) {
        const [encRes, vacRes] = await Promise.allSettled([
          fetch(
            `http://localhost:3003/encounters?patient_id=${encodeURIComponent(patient.id)}`
          ),
          fetch(
            `http://localhost:3003/vaccinations?patient_id=${encodeURIComponent(patient.id)}`
          ),
        ]);
        encounters =
          encRes.status === "fulfilled" && encRes.value.ok
            ? await encRes.value.json()
            : [];
        vaccinations =
          vacRes.status === "fulfilled" && vacRes.value.ok
            ? await vacRes.value.json()
            : [];
      }

      // Step 4: Fetch payments for each enrollment
      let payments: CitizenRecord["payments"] = [];
      if (enrollments.length > 0) {
        const paymentResults = await Promise.allSettled(
          enrollments.map((e: { id: string }) =>
            fetch(
              `http://localhost:3004/payments?enrollment_id=${encodeURIComponent(e.id)}`
            )
          )
        );
        for (const result of paymentResults) {
          if (result.status === "fulfilled" && result.value.ok) {
            const data = await result.value.json();
            payments = payments.concat(data);
          }
        }
      }

      setRecord({
        citizen,
        vitalEvents: Array.isArray(vitalEvents) ? vitalEvents : [],
        patient,
        encounters: Array.isArray(encounters) ? encounters : [],
        vaccinations: Array.isArray(vaccinations) ? vaccinations : [],
        enrollments: Array.isArray(enrollments) ? enrollments : [],
        payments: Array.isArray(payments) ? payments : [],
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
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
          <li className="govuk-breadcrumbs__list-item">Check my record</li>
        </ol>
      </nav>

      {!record && (
        <>
          <h1 className="govuk-heading-xl">Check my record</h1>
          <p className="govuk-body-l">
            View your personal record across all government services.
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

      {!record && (
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
            {loading ? "Loading your record..." : "View my record"}
          </button>
        </form>
      )}

      {loading && <div className="govuk-loading">Loading your record</div>}

      {record && (
        <>
          <h1 className="govuk-heading-xl">
            {record.citizen.given_name} {record.citizen.family_name}
          </h1>

          {/* Personal Information */}
          <h2 className="govuk-heading-l">Personal information</h2>
          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">National ID</dt>
              <dd className="govuk-summary-list__value">
                {record.citizen.national_id}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Date of birth</dt>
              <dd className="govuk-summary-list__value">
                {record.citizen.date_of_birth}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Sex</dt>
              <dd className="govuk-summary-list__value">
                {record.citizen.sex.charAt(0).toUpperCase() +
                  record.citizen.sex.slice(1)}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Status</dt>
              <dd className="govuk-summary-list__value">
                <span
                  className={`govuk-tag ${record.citizen.status === "alive" ? "govuk-tag--green" : "govuk-tag--grey"}`}
                >
                  {record.citizen.status}
                </span>
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Registered</dt>
              <dd className="govuk-summary-list__value">
                {new Date(record.citizen.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>

          {/* Vital Events */}
          <h2 className="govuk-heading-l">Vital events</h2>
          {record.vitalEvents.length === 0 ? (
            <p className="govuk-body">No vital events recorded.</p>
          ) : (
            <table className="govuk-table">
              <thead>
                <tr>
                  <th className="govuk-table__header">Type</th>
                  <th className="govuk-table__header">Date</th>
                  <th className="govuk-table__header">Reference</th>
                </tr>
              </thead>
              <tbody>
                {record.vitalEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td className="govuk-table__cell">
                      <span
                        className={`govuk-tag ${ev.type === "birth" ? "govuk-tag--green" : ev.type === "death" ? "govuk-tag--grey" : "govuk-tag--blue"}`}
                        style={
                          ev.type === "marriage"
                            ? { background: "#912b88" }
                            : undefined
                        }
                      >
                        {ev.type}
                      </span>
                    </td>
                    <td className="govuk-table__cell">{ev.date}</td>
                    <td className="govuk-table__cell">
                      {ev.id.slice(0, 8)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Health */}
          <h2 className="govuk-heading-l">Health record</h2>
          {!record.patient ? (
            <p className="govuk-body">No health record found.</p>
          ) : (
            <>
              {record.patient.blood_type && (
                <p className="govuk-body">
                  Blood type: <strong>{record.patient.blood_type}</strong>
                </p>
              )}
              {record.patient.allergies &&
                record.patient.allergies.length > 0 && (
                  <p className="govuk-body">
                    Allergies:{" "}
                    <strong>{record.patient.allergies.join(", ")}</strong>
                  </p>
                )}

              <h3 className="govuk-heading-m">Vaccinations</h3>
              {record.vaccinations.length === 0 ? (
                <p className="govuk-body">No vaccinations recorded.</p>
              ) : (
                <table className="govuk-table">
                  <thead>
                    <tr>
                      <th className="govuk-table__header">Vaccine</th>
                      <th className="govuk-table__header">Dose</th>
                      <th className="govuk-table__header">Date</th>
                      <th className="govuk-table__header">Next due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.vaccinations.map((v) => (
                      <tr key={v.id}>
                        <td className="govuk-table__cell">{v.vaccine_name}</td>
                        <td className="govuk-table__cell">{v.dose_number}</td>
                        <td className="govuk-table__cell">
                          {v.date_administered}
                        </td>
                        <td className="govuk-table__cell">
                          {v.next_dose_due || "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h3 className="govuk-heading-m">Encounters</h3>
              {record.encounters.length === 0 ? (
                <p className="govuk-body">No encounters recorded.</p>
              ) : (
                <table className="govuk-table">
                  <thead>
                    <tr>
                      <th className="govuk-table__header">Type</th>
                      <th className="govuk-table__header">Date</th>
                      <th className="govuk-table__header">Facility</th>
                      <th className="govuk-table__header">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.encounters.map((enc) => (
                      <tr key={enc.id}>
                        <td className="govuk-table__cell">{enc.type}</td>
                        <td className="govuk-table__cell">{enc.date}</td>
                        <td className="govuk-table__cell">{enc.facility}</td>
                        <td className="govuk-table__cell">
                          <span
                            className={`govuk-tag ${enc.status === "completed" ? "govuk-tag--green" : enc.status === "cancelled" ? "govuk-tag--red" : ""}`}
                          >
                            {enc.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* Benefits */}
          <h2 className="govuk-heading-l">Benefits</h2>
          {record.enrollments.length === 0 ? (
            <p className="govuk-body">No benefit enrollments found.</p>
          ) : (
            <>
              <table className="govuk-table">
                <thead>
                  <tr>
                    <th className="govuk-table__header">Programme</th>
                    <th className="govuk-table__header">Status</th>
                    <th className="govuk-table__header">Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {record.enrollments.map((en) => (
                    <tr key={en.id}>
                      <td className="govuk-table__cell">
                        {en.program_name || en.program_id.slice(0, 8) + "..."}
                      </td>
                      <td className="govuk-table__cell">
                        <span
                          className={`govuk-tag ${en.status === "active" ? "govuk-tag--green" : en.status === "terminated" ? "govuk-tag--red" : "govuk-tag--grey"}`}
                        >
                          {en.status}
                        </span>
                      </td>
                      <td className="govuk-table__cell">
                        {new Date(en.enrolled_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {record.payments.length > 0 && (
                <>
                  <h3 className="govuk-heading-m">Payment history</h3>
                  <table className="govuk-table">
                    <thead>
                      <tr>
                        <th className="govuk-table__header">Date</th>
                        <th className="govuk-table__header">Amount</th>
                        <th className="govuk-table__header">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="govuk-table__cell">
                            {p.paid_date || p.scheduled_date}
                          </td>
                          <td className="govuk-table__cell">
                            {p.currency} {p.amount.toFixed(2)}
                          </td>
                          <td className="govuk-table__cell">
                            <span
                              className={`govuk-tag ${p.status === "paid" ? "govuk-tag--green" : p.status === "failed" ? "govuk-tag--red" : ""}`}
                            >
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}

          <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

          <button
            className="govuk-button govuk-button--secondary"
            onClick={() => {
              setRecord(null);
              setNationalId("");
            }}
          >
            Look up another record
          </button>
        </>
      )}
    </>
  );
}
