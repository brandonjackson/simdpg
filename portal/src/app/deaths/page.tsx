"use client";

import { useState } from "react";

interface CitizenInfo {
  id: string;
  national_id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string;
  sex: string;
}

type Step = "citizen" | "details" | "review" | "success";

export default function RegisterDeath() {
  const [step, setStep] = useState<Step>("citizen");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [nationalId, setNationalId] = useState("");
  const [citizen, setCitizen] = useState<CitizenInfo | null>(null);

  const [dateOfDeath, setDateOfDeath] = useState("");
  const [placeOfDeath, setPlaceOfDeath] = useState("");
  const [causeOfDeath, setCauseOfDeath] = useState("");

  const [registrationId, setRegistrationId] = useState("");

  async function handleCitizenLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/lookup?type=citizen&national_id=${encodeURIComponent(nationalId)}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Citizen not found");
      }
      const data = await res.json();
      setCitizen(data);
      setStep("details");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function handleDetails(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!dateOfDeath || !placeOfDeath) {
      setError("Date and place of death are required");
      return;
    }
    setStep("review");
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3002/deaths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizen_id: citizen!.id,
          date_of_death: dateOfDeath,
          place_of_death: placeOfDeath,
          cause_of_death: causeOfDeath || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to register death");
      }
      const data = await res.json();
      setRegistrationId(data.id);
      setStep("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (step === "success") {
    return (
      <>
        <div className="govuk-panel">
          <h1 className="govuk-panel__title">Death registered</h1>
          <div className="govuk-panel__body">
            Registration reference
            <br />
            <strong>{registrationId}</strong>
          </div>
        </div>
        <p className="govuk-body" style={{ marginTop: 30 }}>
          The death of{" "}
          <strong>
            {citizen?.given_name} {citizen?.family_name}
          </strong>{" "}
          has been registered.
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
          <li className="govuk-breadcrumbs__list-item">Register a death</li>
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
              What is the deceased&apos;s national ID?
            </label>
            <div className="govuk-hint">
              Enter the national identity number of the person who has died.
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

      {step === "details" && (
        <form onSubmit={handleDetails}>
          <div className="govuk-step-indicator">Step 2 of 3</div>

          {citizen && (
            <div className="govuk-citizen-confirmed">
              <p className="govuk-citizen-confirmed__name">
                {citizen.given_name} {citizen.family_name}
              </p>
              <p className="govuk-citizen-confirmed__details">
                National ID: {citizen.national_id} &middot; DOB:{" "}
                {citizen.date_of_birth}
              </p>
            </div>
          )}

          <h1 className="govuk-heading-l">Death details</h1>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="date-of-death">
              Date of death
            </label>
            <input
              className="govuk-input govuk-input--width-10"
              id="date-of-death"
              type="date"
              value={dateOfDeath}
              onChange={(e) => setDateOfDeath(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="place-of-death">
              Place of death
            </label>
            <input
              className="govuk-input govuk-input--width-20"
              id="place-of-death"
              type="text"
              value={placeOfDeath}
              onChange={(e) => setPlaceOfDeath(e.target.value)}
              required
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="cause-of-death">
              Cause of death
            </label>
            <div className="govuk-hint">Optional</div>
            <textarea
              className="govuk-textarea"
              id="cause-of-death"
              rows={3}
              value={causeOfDeath}
              onChange={(e) => setCauseOfDeath(e.target.value)}
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
            Check your answers before registering
          </h1>

          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Deceased</dt>
              <dd className="govuk-summary-list__value">
                {citizen?.given_name} {citizen?.family_name} (
                {citizen?.national_id})
              </dd>
              <dd className="govuk-summary-list__actions">
                <a
                  href="#"
                  className="govuk-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setStep("citizen");
                  }}
                >
                  Change
                </a>
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Date of death</dt>
              <dd className="govuk-summary-list__value">{dateOfDeath}</dd>
              <dd className="govuk-summary-list__actions">
                <a
                  href="#"
                  className="govuk-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setStep("details");
                  }}
                >
                  Change
                </a>
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Place of death</dt>
              <dd className="govuk-summary-list__value">{placeOfDeath}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Cause of death</dt>
              <dd className="govuk-summary-list__value">
                {causeOfDeath || "Not specified"}
              </dd>
            </div>
          </dl>

          <div className="govuk-warning-text">
            <span className="govuk-warning-text__icon" aria-hidden="true">
              !
            </span>
            <strong className="govuk-warning-text__text">
              By submitting this form you are confirming that, to the best of
              your knowledge, the details provided are correct.
            </strong>
          </div>

          <button
            className="govuk-button"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Registering..." : "Register death"}
          </button>
          <br />
          <button
            className="govuk-button govuk-button--secondary"
            onClick={() => setStep("details")}
          >
            Back
          </button>
        </>
      )}
    </>
  );
}
