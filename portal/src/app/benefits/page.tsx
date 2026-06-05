"use client";

import { useState, useEffect } from "react";

interface CitizenInfo {
  id: string;
  national_id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string;
}

interface Program {
  id: string;
  name: string;
  description: string;
  payment_amount: number;
  payment_frequency: string;
  status: string;
}

interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  citizen_id: string;
  program_id: string;
}

type Step = "citizen" | "program" | "eligibility" | "success";

export default function ApplyForBenefit() {
  const [step, setStep] = useState<Step>("citizen");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [nationalId, setNationalId] = useState("");
  const [citizen, setCitizen] = useState<CitizenInfo | null>(null);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");

  const [eligibility, setEligibility] = useState<EligibilityResult | null>(
    null
  );
  const [enrollmentId, setEnrollmentId] = useState("");

  useEffect(() => {
    fetch("/api/lookup?type=programs&program_status=active")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPrograms(data);
      })
      .catch(() => {});
  }, []);

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
      setStep("program");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckEligibility(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedProgramId) {
      setError("Please select a programme");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3004/eligibility/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizen_id: citizen!.id,
          program_id: selectedProgramId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Eligibility check failed");
      }
      const data = await res.json();
      setEligibility(data);
      setStep("eligibility");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnroll() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3004/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizen_id: citizen!.id,
          program_id: selectedProgramId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Enrollment failed");
      }
      const data = await res.json();
      setEnrollmentId(data.id);
      setStep("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setLoading(false);
    }
  }

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);

  if (step === "success") {
    return (
      <>
        <div className="govuk-panel">
          <h1 className="govuk-panel__title">Application submitted</h1>
          <div className="govuk-panel__body">
            Enrollment reference
            <br />
            <strong>{enrollmentId}</strong>
          </div>
        </div>
        <p className="govuk-body" style={{ marginTop: 30 }}>
          <strong>
            {citizen?.given_name} {citizen?.family_name}
          </strong>{" "}
          has been enrolled in <strong>{selectedProgram?.name}</strong>.
        </p>
        {selectedProgram && (
          <div className="govuk-inset-text">
            Payment: ${selectedProgram.payment_amount.toFixed(2)}{" "}
            {selectedProgram.payment_frequency}
          </div>
        )}
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
          <li className="govuk-breadcrumbs__list-item">Apply for a benefit</li>
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
              What is your national ID?
            </label>
            <div className="govuk-hint">
              Enter your national identity number as it appears on your ID card.
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

      {step === "program" && (
        <form onSubmit={handleCheckEligibility}>
          <div className="govuk-step-indicator">Step 2 of 3</div>

          {citizen && (
            <div className="govuk-citizen-confirmed">
              <p className="govuk-citizen-confirmed__name">
                {citizen.given_name} {citizen.family_name}
              </p>
              <p className="govuk-citizen-confirmed__details">
                National ID: {citizen.national_id}
              </p>
            </div>
          )}

          <div className="govuk-form-group">
            <label
              className="govuk-label govuk-label--l"
              htmlFor="program-select"
            >
              Which programme would you like to apply for?
            </label>
            {programs.length === 0 ? (
              <p className="govuk-body">
                No active programmes are currently available. Please try again
                later.
              </p>
            ) : (
              <>
                <div className="govuk-radios">
                  {programs.map((p) => (
                    <div className="govuk-radios__item" key={p.id}>
                      <input
                        className="govuk-radios__input"
                        id={`program-${p.id}`}
                        name="program"
                        type="radio"
                        value={p.id}
                        checked={selectedProgramId === p.id}
                        onChange={() => setSelectedProgramId(p.id)}
                      />
                      <label
                        className="govuk-radios__label"
                        htmlFor={`program-${p.id}`}
                      >
                        <strong>{p.name}</strong>
                        <br />
                        <span style={{ fontSize: 16, color: "#505a5f" }}>
                          {p.description} &mdash; $
                          {p.payment_amount.toFixed(2)} {p.payment_frequency}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            className="govuk-button"
            type="submit"
            disabled={loading || programs.length === 0}
          >
            {loading ? "Checking..." : "Check eligibility"}
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

      {step === "eligibility" && eligibility && (
        <>
          <div className="govuk-step-indicator">Step 3 of 3</div>
          <h1 className="govuk-heading-l">Eligibility result</h1>

          {eligibility.eligible ? (
            <>
              <div
                className="govuk-notification-banner govuk-notification-banner--success"
                role="alert"
              >
                <h2 className="govuk-notification-banner__heading">
                  Eligible
                </h2>
                <div className="govuk-notification-banner__content">
                  <p>
                    <strong>
                      {citizen?.given_name} {citizen?.family_name}
                    </strong>{" "}
                    is eligible for <strong>{selectedProgram?.name}</strong>.
                  </p>
                </div>
              </div>

              {eligibility.reasons.length > 0 && (
                <div className="govuk-inset-text">
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {eligibility.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <dl className="govuk-summary-list">
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Programme</dt>
                  <dd className="govuk-summary-list__value">
                    {selectedProgram?.name}
                  </dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Payment</dt>
                  <dd className="govuk-summary-list__value">
                    ${selectedProgram?.payment_amount.toFixed(2)}{" "}
                    {selectedProgram?.payment_frequency}
                  </dd>
                </div>
              </dl>

              <button
                className="govuk-button"
                onClick={handleEnroll}
                disabled={loading}
              >
                {loading ? "Enrolling..." : "Enroll now"}
              </button>
            </>
          ) : (
            <>
              <div className="govuk-error-summary" role="alert">
                <h2 className="govuk-error-summary__title">Not eligible</h2>
                <ul className="govuk-error-summary__list">
                  {eligibility.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
              <p className="govuk-body">
                You may try a different programme or contact your local office
                for assistance.
              </p>
            </>
          )}

          <br />
          <button
            className="govuk-button govuk-button--secondary"
            onClick={() => {
              setStep("program");
              setEligibility(null);
            }}
          >
            Back
          </button>
        </>
      )}
    </>
  );
}
