"use client";

import { useState } from "react";

interface CitizenInfo {
  id: string;
  national_id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string;
}

interface PatientInfo {
  id: string;
  citizen_id: string;
  blood_type: string | null;
  status: string;
}

type Step = "citizen" | "vaccine" | "review" | "success";

export default function BookVaccination() {
  const [step, setStep] = useState<Step>("citizen");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [nationalId, setNationalId] = useState("");
  const [citizen, setCitizen] = useState<CitizenInfo | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);

  const [vaccineName, setVaccineName] = useState("");
  const [doseNumber, setDoseNumber] = useState("1");
  const [batchNumber, setBatchNumber] = useState("");
  const [dateAdministered, setDateAdministered] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [nextDoseDue, setNextDoseDue] = useState("");

  const [vaccinationId, setVaccinationId] = useState("");

  async function handleCitizenLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Look up citizen
      const citizenRes = await fetch(
        `/api/lookup?type=citizen&national_id=${encodeURIComponent(nationalId)}`
      );
      if (!citizenRes.ok) {
        const data = await citizenRes.json();
        throw new Error(data.error || "Citizen not found");
      }
      const citizenData = await citizenRes.json();
      setCitizen(citizenData);

      // Look up patient record
      const patientRes = await fetch(
        `/api/lookup?type=patient&citizen_id=${encodeURIComponent(citizenData.id)}`
      );
      if (!patientRes.ok) {
        // If no patient record, create one
        const createRes = await fetch("/api/proxy/health/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ citizen_id: citizenData.id }),
        });
        if (!createRes.ok) {
          throw new Error("Failed to create patient record");
        }
        const newPatient = await createRes.json();
        setPatient(newPatient);
      } else {
        const patientData = await patientRes.json();
        setPatient(patientData);
      }

      setStep("vaccine");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function handleVaccineDetails(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!vaccineName || !batchNumber || !dateAdministered) {
      setError("Vaccine name, batch number, and date are required");
      return;
    }
    setStep("review");
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      // Create an encounter for the vaccination
      const encounterRes = await fetch("/api/proxy/health/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patient!.id,
          type: "vaccination",
          date: dateAdministered,
          facility: "SimDPG Health Centre",
          provider: "Portal Staff",
          notes: `${vaccineName} dose ${doseNumber}`,
          status: "completed",
        }),
      });
      if (!encounterRes.ok) {
        const data = await encounterRes.json();
        throw new Error(data.error || "Failed to create encounter");
      }
      const encounter = await encounterRes.json();

      // Record the vaccination
      const vacRes = await fetch("/api/proxy/health/vaccinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patient!.id,
          encounter_id: encounter.id,
          vaccine_name: vaccineName,
          dose_number: parseInt(doseNumber),
          date_administered: dateAdministered,
          next_dose_due: nextDoseDue || undefined,
          batch_number: batchNumber,
        }),
      });
      if (!vacRes.ok) {
        const data = await vacRes.json();
        throw new Error(data.error || "Failed to record vaccination");
      }
      const vaccination = await vacRes.json();
      setVaccinationId(vaccination.id);
      setStep("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Recording failed");
    } finally {
      setLoading(false);
    }
  }

  const commonVaccines = [
    "BCG",
    "OPV (Oral Polio)",
    "IPV (Inactivated Polio)",
    "DTP (Diphtheria, Tetanus, Pertussis)",
    "Hepatitis B",
    "Hib (Haemophilus influenzae type b)",
    "Measles",
    "MMR (Measles, Mumps, Rubella)",
    "PCV (Pneumococcal)",
    "Rotavirus",
    "COVID-19",
    "Influenza",
    "HPV (Human Papillomavirus)",
    "Yellow Fever",
    "Typhoid",
  ];

  if (step === "success") {
    return (
      <>
        <div className="govuk-panel">
          <h1 className="govuk-panel__title">Vaccination recorded</h1>
          <div className="govuk-panel__body">
            Vaccination reference
            <br />
            <strong>{vaccinationId}</strong>
          </div>
        </div>
        <p className="govuk-body" style={{ marginTop: 30 }}>
          <strong>{vaccineName}</strong> (dose {doseNumber}) has been recorded
          for{" "}
          <strong>
            {citizen?.given_name} {citizen?.family_name}
          </strong>
          .
        </p>
        {nextDoseDue && (
          <div className="govuk-inset-text">
            Next dose is due on <strong>{nextDoseDue}</strong>.
          </div>
        )}
        <p className="govuk-body">
          <a href="/vaccinations" className="govuk-link">
            Record another vaccination
          </a>
        </p>
        <p className="govuk-body">
          <a href="/" className="govuk-link">
            Return to home
          </a>
        </p>
      </>
    );
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
          <li className="govuk-breadcrumbs__list-item">Book a vaccination</li>
        </ol>
      </nav>

      {error && (
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title">There is a problem</h2>
          <ul className="govuk-error-summary__list">
            <li>{error}</li>
          </ul>
        </div>
      )}

      {step === "citizen" && (
        <form onSubmit={handleCitizenLookup}>
          <div className="govuk-step-indicator">Step 1 of 3</div>
          <div className="govuk-form-group">
            <label
              className="govuk-label govuk-label--l"
              htmlFor="citizen-nid"
            >
              What is the patient&apos;s national ID?
            </label>
            <div className="govuk-hint">
              Enter the national identity number. A patient record will be
              created if one does not exist.
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
            {loading ? "Looking up..." : "Continue"}
          </button>
        </form>
      )}

      {step === "vaccine" && (
        <form onSubmit={handleVaccineDetails}>
          <div className="govuk-step-indicator">Step 2 of 3</div>

          {citizen && (
            <div className="govuk-citizen-confirmed">
              <p className="govuk-citizen-confirmed__name">
                {citizen.given_name} {citizen.family_name}
              </p>
              <p className="govuk-citizen-confirmed__details">
                National ID: {citizen.national_id} &middot; Patient ID:{" "}
                {patient?.id?.slice(0, 8)}...
              </p>
            </div>
          )}

          <h1 className="govuk-heading-l">Vaccination details</h1>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="vaccine-name">
              Vaccine
            </label>
            <select
              className="govuk-select"
              id="vaccine-name"
              value={vaccineName}
              onChange={(e) => setVaccineName(e.target.value)}
              required
            >
              <option value="">Select a vaccine</option>
              {commonVaccines.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="dose-number">
              Dose number
            </label>
            <input
              className="govuk-input govuk-input--width-3"
              id="dose-number"
              type="number"
              min="1"
              max="10"
              value={doseNumber}
              onChange={(e) => setDoseNumber(e.target.value)}
              required
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="batch-number">
              Batch number
            </label>
            <input
              className="govuk-input govuk-input--width-10"
              id="batch-number"
              type="text"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              required
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="date-administered">
              Date administered
            </label>
            <input
              className="govuk-input govuk-input--width-10"
              id="date-administered"
              type="date"
              value={dateAdministered}
              onChange={(e) => setDateAdministered(e.target.value)}
              required
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="next-dose-due">
              Next dose due date
            </label>
            <div className="govuk-hint">Optional. Leave blank if no further doses required.</div>
            <input
              className="govuk-input govuk-input--width-10"
              id="next-dose-due"
              type="date"
              value={nextDoseDue}
              onChange={(e) => setNextDoseDue(e.target.value)}
            />
          </div>

          <button className="govuk-button" type="submit">
            Continue
          </button>
          <br />
          <button
            type="button"
            className="govuk-button govuk-button--secondary"
            onClick={() => {
              setStep("citizen");
              setCitizen(null);
              setPatient(null);
            }}
          >
            Back
          </button>
        </form>
      )}

      {step === "review" && (
        <>
          <div className="govuk-step-indicator">Step 3 of 3</div>
          <h1 className="govuk-heading-l">
            Check your answers before recording
          </h1>

          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Patient</dt>
              <dd className="govuk-summary-list__value">
                {citizen?.given_name} {citizen?.family_name} (
                {citizen?.national_id})
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Vaccine</dt>
              <dd className="govuk-summary-list__value">{vaccineName}</dd>
              <dd className="govuk-summary-list__actions">
                <a
                  href="#"
                  className="govuk-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setStep("vaccine");
                  }}
                >
                  Change
                </a>
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Dose number</dt>
              <dd className="govuk-summary-list__value">{doseNumber}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Batch number</dt>
              <dd className="govuk-summary-list__value">{batchNumber}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Date administered</dt>
              <dd className="govuk-summary-list__value">{dateAdministered}</dd>
            </div>
            {nextDoseDue && (
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Next dose due</dt>
                <dd className="govuk-summary-list__value">{nextDoseDue}</dd>
              </div>
            )}
          </dl>

          <button
            className="govuk-button"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Recording..." : "Record vaccination"}
          </button>
          <br />
          <button
            className="govuk-button govuk-button--secondary"
            onClick={() => setStep("vaccine")}
          >
            Back
          </button>
        </>
      )}
    </>
  );
}
