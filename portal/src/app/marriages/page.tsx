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

type Step = "spouse1" | "spouse2" | "details" | "review" | "success";

export default function RegisterMarriage() {
  const [step, setStep] = useState<Step>("spouse1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [spouse1NationalId, setSpouse1NationalId] = useState("");
  const [spouse1, setSpouse1] = useState<CitizenInfo | null>(null);

  const [spouse2NationalId, setSpouse2NationalId] = useState("");
  const [spouse2, setSpouse2] = useState<CitizenInfo | null>(null);

  const [dateOfMarriage, setDateOfMarriage] = useState("");
  const [placeOfMarriage, setPlaceOfMarriage] = useState("");

  const [registrationId, setRegistrationId] = useState("");

  async function lookupCitizen(nationalId: string): Promise<CitizenInfo> {
    const res = await fetch(
      `/api/lookup?type=citizen&national_id=${encodeURIComponent(nationalId)}`
    );
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Citizen not found");
    }
    return res.json();
  }

  async function handleSpouse1Lookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const citizen = await lookupCitizen(spouse1NationalId);
      setSpouse1(citizen);
      setStep("spouse2");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSpouse2Lookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const citizen = await lookupCitizen(spouse2NationalId);
      if (citizen.id === spouse1?.id) {
        setError("Spouse 2 cannot be the same person as Spouse 1");
        setLoading(false);
        return;
      }
      setSpouse2(citizen);
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
    if (!dateOfMarriage || !placeOfMarriage) {
      setError("All fields are required");
      return;
    }
    setStep("review");
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/proxy/civil-registry/marriages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spouse_1_citizen_id: spouse1!.id,
          spouse_2_citizen_id: spouse2!.id,
          date_of_marriage: dateOfMarriage,
          place_of_marriage: placeOfMarriage,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to register marriage");
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
          <h1 className="govuk-panel__title">Marriage registered</h1>
          <div className="govuk-panel__body">
            Registration reference
            <br />
            <strong>{registrationId}</strong>
          </div>
        </div>
        <p className="govuk-body" style={{ marginTop: 30 }}>
          The marriage of{" "}
          <strong>
            {spouse1?.given_name} {spouse1?.family_name}
          </strong>{" "}
          and{" "}
          <strong>
            {spouse2?.given_name} {spouse2?.family_name}
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
          <li className="govuk-breadcrumbs__list-item">Register a marriage</li>
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

      {step === "spouse1" && (
        <form onSubmit={handleSpouse1Lookup}>
          <div className="govuk-step-indicator">Step 1 of 4</div>
          <div className="govuk-form-group">
            <label
              className="govuk-label govuk-label--l"
              htmlFor="spouse1-nid"
            >
              What is the first spouse&apos;s national ID?
            </label>
            <div className="govuk-hint">
              Enter the national identity number as it appears on their ID card.
            </div>
            <input
              className="govuk-input govuk-input--width-20"
              id="spouse1-nid"
              type="text"
              value={spouse1NationalId}
              onChange={(e) => setSpouse1NationalId(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button className="govuk-button" type="submit" disabled={loading}>
            {loading ? "Looking up..." : "Continue"}
          </button>
        </form>
      )}

      {step === "spouse2" && (
        <form onSubmit={handleSpouse2Lookup}>
          <div className="govuk-step-indicator">Step 2 of 4</div>

          {spouse1 && (
            <div className="govuk-citizen-confirmed">
              <p className="govuk-citizen-confirmed__name">
                Spouse 1: {spouse1.given_name} {spouse1.family_name}
              </p>
              <p className="govuk-citizen-confirmed__details">
                National ID: {spouse1.national_id} &middot; DOB:{" "}
                {spouse1.date_of_birth}
              </p>
            </div>
          )}

          <div className="govuk-form-group">
            <label
              className="govuk-label govuk-label--l"
              htmlFor="spouse2-nid"
            >
              What is the second spouse&apos;s national ID?
            </label>
            <input
              className="govuk-input govuk-input--width-20"
              id="spouse2-nid"
              type="text"
              value={spouse2NationalId}
              onChange={(e) => setSpouse2NationalId(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button className="govuk-button" type="submit" disabled={loading}>
            {loading ? "Looking up..." : "Continue"}
          </button>
          <br />
          <button
            type="button"
            className="govuk-button govuk-button--secondary"
            onClick={() => {
              setStep("spouse1");
              setSpouse1(null);
            }}
          >
            Back
          </button>
        </form>
      )}

      {step === "details" && (
        <form onSubmit={handleDetails}>
          <div className="govuk-step-indicator">Step 3 of 4</div>

          <div className="govuk-citizen-confirmed">
            <p className="govuk-citizen-confirmed__name">
              {spouse1?.given_name} {spouse1?.family_name} &amp;{" "}
              {spouse2?.given_name} {spouse2?.family_name}
            </p>
          </div>

          <h1 className="govuk-heading-l">Marriage details</h1>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="date-of-marriage">
              Date of marriage
            </label>
            <input
              className="govuk-input govuk-input--width-10"
              id="date-of-marriage"
              type="date"
              value={dateOfMarriage}
              onChange={(e) => setDateOfMarriage(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="place-of-marriage">
              Place of marriage
            </label>
            <input
              className="govuk-input govuk-input--width-20"
              id="place-of-marriage"
              type="text"
              value={placeOfMarriage}
              onChange={(e) => setPlaceOfMarriage(e.target.value)}
              required
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
              setStep("spouse2");
              setSpouse2(null);
            }}
          >
            Back
          </button>
        </form>
      )}

      {step === "review" && (
        <>
          <div className="govuk-step-indicator">Step 4 of 4</div>
          <h1 className="govuk-heading-l">
            Check your answers before registering
          </h1>

          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Spouse 1</dt>
              <dd className="govuk-summary-list__value">
                {spouse1?.given_name} {spouse1?.family_name} (
                {spouse1?.national_id})
              </dd>
              <dd className="govuk-summary-list__actions">
                <a
                  href="#"
                  className="govuk-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setStep("spouse1");
                  }}
                >
                  Change
                </a>
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Spouse 2</dt>
              <dd className="govuk-summary-list__value">
                {spouse2?.given_name} {spouse2?.family_name} (
                {spouse2?.national_id})
              </dd>
              <dd className="govuk-summary-list__actions">
                <a
                  href="#"
                  className="govuk-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setStep("spouse2");
                  }}
                >
                  Change
                </a>
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Date of marriage</dt>
              <dd className="govuk-summary-list__value">{dateOfMarriage}</dd>
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
              <dt className="govuk-summary-list__key">Place of marriage</dt>
              <dd className="govuk-summary-list__value">{placeOfMarriage}</dd>
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
            {loading ? "Registering..." : "Register marriage"}
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
