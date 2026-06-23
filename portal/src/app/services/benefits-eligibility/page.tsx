"use client";

import { useState } from "react";
import { SERVICES } from "@/lib/service-registry";
import { listData } from "@/lib/api";

const service = SERVICES.find((s) => s.id === "benefits-eligibility")!;

function workflowEnvVar(part: 1 | 2 | 3): string {
  return service.openfnWorkflows.find((w) =>
    w.name.endsWith(`(Part ${part})`),
  )!.envVar!;
}

async function callWorkflow(part: 1 | 2 | 3, payload: Record<string, unknown>) {
  const envVar = workflowEnvVar(part);
  const res = await fetch(
    `/api/check-benefit-eligibility?workflow=${encodeURIComponent(envVar)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const json = await res.json();
  // OpenFn wraps sync replies: { data: <job output>, meta: {...} }
  const data = json?.data ?? json;
  return { ok: res.ok, data };
}

interface Program {
  id: string;
  name: string;
  description: string;
  payment_amount: number;
  payment_frequency: "monthly" | "one-time" | "quarterly";
}

type Step = "national-id" | "programs" | "eligibility" | "enrolment-result";

function formatFrequency(freq: string) {
  if (freq === "one-time") return "one-time payment";
  if (freq === "monthly") return "per month";
  if (freq === "quarterly") return "per quarter";
  return freq;
}

export default function BenefitsEligibilityPage() {
  const [step, setStep] = useState<Step>("national-id");
  const [nationalId, setNationalId] = useState("");
  const [citizenId, setCitizenId] = useState("");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [enrolmentSuccess, setEnrolmentSuccess] = useState<boolean | null>(null);
  const [enrolmentMessage, setEnrolmentMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedProgram = programs.find((p) => p.id === selectedProgramId) ?? null;

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!nationalId.trim()) {
      setError("Enter your national ID");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { ok, data } = await callWorkflow(1, { national_id: nationalId.trim() });
      if (!ok || !data.success) {
        throw new Error(data.message || data.error || "Lookup failed");
      }
      setCitizenId(data.citizen.id);
      setPrograms(listData<Program>(data.programs));
      setSelectedProgramId("");
      setStep("programs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckEligibility(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProgramId) {
      setError("Select a programme to continue");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { ok, data } = await callWorkflow(2, {
        citizen_id: citizenId,
        program_id: selectedProgramId,
      });
      if (!ok && !data.success) {
        throw new Error(data.message || data.error || "Eligibility check failed");
      }
      setEligible(data.success === true);
      setStep("eligibility");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eligibility check failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnrol() {
    setError("");
    setLoading(true);
    try {
      const { ok, data } = await callWorkflow(3, {
        citizen_id: citizenId,
        program_id: selectedProgramId,
      });
      if (!ok) {
        throw new Error(data.error || "Enrolment request failed");
      }
      setEnrolmentSuccess(data.success === true);
      setEnrolmentMessage(data.message || "");
      setStep("enrolment-result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrolment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <nav className="govuk-breadcrumbs" aria-label="Breadcrumb">
        <ol className="govuk-breadcrumbs__list">
          <li className="govuk-breadcrumbs__list-item">
            <a className="govuk-breadcrumbs__link" href="/">
              Home
            </a>
          </li>
          <li className="govuk-breadcrumbs__list-item">Check benefit eligibility</li>
        </ol>
      </nav>

      {/* Step 1: Enter national ID */}
      {step === "national-id" && (
        <>
          <h1 className="govuk-heading-xl">Check benefit eligibility</h1>
          <p className="govuk-body-l">
            Find out which social programmes you may be eligible for and apply.
          </p>

          {error && (
            <div className="govuk-error-summary" role="alert">
              <h2 className="govuk-error-summary__title">There is a problem</h2>
              <ul className="govuk-error-summary__list">
                <li>{error}</li>
              </ul>
            </div>
          )}

          <form onSubmit={handleLookup} noValidate>
            <div className={`govuk-form-group${error ? " govuk-form-group--error" : ""}`}>
              <label className="govuk-label govuk-label--m" htmlFor="national-id">
                National ID number
              </label>
              <div className="govuk-hint">For example, SIM-000001</div>
              {error && <p className="govuk-error-message">{error}</p>}
              <input
                className={`govuk-input govuk-input--width-20${error ? " govuk-input--error" : ""}`}
                id="national-id"
                type="text"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button className="govuk-button" type="submit" disabled={loading}>
              {loading ? "Looking up..." : "Continue"}
            </button>
          </form>
        </>
      )}

      {/* Step 2: Select programme */}
      {step === "programs" && (
        <>
          <a
            className="govuk-back-link"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setError("");
              setStep("national-id");
            }}
          >
            Back
          </a>

          <h1 className="govuk-heading-xl">Select a programme</h1>

          <div className="govuk-inset-text">
            <p className="govuk-body govuk-!-margin-bottom-0">
              National ID: <strong>{nationalId}</strong>
            </p>
          </div>

          {error && (
            <div className="govuk-error-summary" role="alert">
              <h2 className="govuk-error-summary__title">There is a problem</h2>
              <ul className="govuk-error-summary__list">
                <li>{error}</li>
              </ul>
            </div>
          )}

          <form onSubmit={handleCheckEligibility} noValidate>
            <div className={`govuk-form-group${error ? " govuk-form-group--error" : ""}`}>
              <fieldset className="govuk-fieldset">
                <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
                  Which programme would you like to check?
                </legend>
                {error && <p className="govuk-error-message">{error}</p>}
                <div className="govuk-radios">
                  {programs.length === 0 && (
                    <p className="govuk-body">No active programmes available at this time.</p>
                  )}
                  {programs.map((program) => (
                    <div className="govuk-radios__item" key={program.id}>
                      <input
                        className="govuk-radios__input"
                        id={`program-${program.id}`}
                        name="program"
                        type="radio"
                        value={program.id}
                        checked={selectedProgramId === program.id}
                        onChange={(e) => setSelectedProgramId(e.target.value)}
                      />
                      <div>
                        <label
                          className="govuk-label govuk-radios__label"
                          htmlFor={`program-${program.id}`}
                        >
                          {program.name}
                        </label>
                        <div className="govuk-hint" style={{ marginTop: 4 }}>
                          {program.description} &mdash; {program.payment_amount}{" "}
                          {formatFrequency(program.payment_frequency)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>

            <button
              className="govuk-button"
              type="submit"
              disabled={loading || programs.length === 0}
            >
              {loading ? "Checking eligibility..." : "Check eligibility"}
            </button>
          </form>
        </>
      )}

      {/* Step 3: Eligibility result */}
      {step === "eligibility" && selectedProgram && (
        <>
          <a
            className="govuk-back-link"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setError("");
              setStep("programs");
            }}
          >
            Back
          </a>

          {error && (
            <div className="govuk-error-summary" role="alert">
              <h2 className="govuk-error-summary__title">There is a problem</h2>
              <ul className="govuk-error-summary__list">
                <li>{error}</li>
              </ul>
            </div>
          )}

          {eligible ? (
            <>
              <div
                className="govuk-notification-banner govuk-notification-banner--success"
                role="alert"
              >
                <h2 className="govuk-notification-banner__heading">
                  You are eligible for {selectedProgram.name}
                </h2>
                <div className="govuk-notification-banner__content">
                  <p>Review the details below and confirm your enrolment.</p>
                </div>
              </div>

              <h1 className="govuk-heading-xl">Confirm your enrolment</h1>

              <dl className="govuk-summary-list">
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">National ID</dt>
                  <dd className="govuk-summary-list__value">{nationalId}</dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Programme</dt>
                  <dd className="govuk-summary-list__value">{selectedProgram.name}</dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Payment</dt>
                  <dd className="govuk-summary-list__value">
                    {selectedProgram.payment_amount}{" "}
                    {formatFrequency(selectedProgram.payment_frequency)}
                  </dd>
                </div>
              </dl>

              <button
                className="govuk-button"
                onClick={handleEnrol}
                disabled={loading}
              >
                {loading ? "Confirming enrolment..." : "Confirm enrolment"}
              </button>

              <p className="govuk-body">
                <a
                  className="govuk-link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedProgramId("");
                    setError("");
                    setStep("programs");
                  }}
                >
                  Choose a different programme
                </a>
              </p>
            </>
          ) : (
            <>
              <h1 className="govuk-heading-xl">You are not eligible</h1>

              <div className="govuk-warning-text">
                <span className="govuk-warning-text__icon" aria-hidden="true">
                  !
                </span>
                <strong className="govuk-warning-text__text">
                  <span className="govuk-visually-hidden">Warning: </span>
                  You do not meet the eligibility criteria for {selectedProgram.name}.
                </strong>
              </div>

              <p className="govuk-body">
                <a
                  className="govuk-link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedProgramId("");
                    setError("");
                    setStep("programs");
                  }}
                >
                  Check a different programme
                </a>
              </p>

              <p className="govuk-body">
                <a href="/" className="govuk-link">
                  Return to services
                </a>
              </p>
            </>
          )}
        </>
      )}

      {/* Step 4: Enrolment result */}
      {step === "enrolment-result" && selectedProgram && (
        <>
          {enrolmentSuccess ? (
            <>
              <div className="govuk-panel govuk-panel--confirmation">
                <h1 className="govuk-panel__title">Application complete</h1>
                <div className="govuk-panel__body">
                  You have been enrolled in {selectedProgram.name}
                </div>
              </div>

              <p className="govuk-body">
                {enrolmentMessage || (
                  <>
                    You are now enrolled in <strong>{selectedProgram.name}</strong>. Your
                    payments will be scheduled shortly.
                  </>
                )}
              </p>

              <dl className="govuk-summary-list">
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Programme</dt>
                  <dd className="govuk-summary-list__value">{selectedProgram.name}</dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Payment</dt>
                  <dd className="govuk-summary-list__value">
                    {selectedProgram.payment_amount}{" "}
                    {formatFrequency(selectedProgram.payment_frequency)}
                  </dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">National ID</dt>
                  <dd className="govuk-summary-list__value">{nationalId}</dd>
                </div>
              </dl>

              <p className="govuk-body">
                <a href="/" className="govuk-link">
                  Return to services
                </a>
              </p>
            </>
          ) : (
            <>
              <h1 className="govuk-heading-xl">Enrolment unsuccessful</h1>

              <div className="govuk-error-summary" role="alert">
                <h2 className="govuk-error-summary__title">
                  There was a problem completing your enrolment
                </h2>
                <div className="govuk-error-summary__body">
                  <p className="govuk-body">
                    {enrolmentMessage || "Your enrolment could not be processed at this time."}
                  </p>
                </div>
              </div>

              <dl className="govuk-summary-list">
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Programme</dt>
                  <dd className="govuk-summary-list__value">{selectedProgram.name}</dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">National ID</dt>
                  <dd className="govuk-summary-list__value">{nationalId}</dd>
                </div>
              </dl>

              <p className="govuk-body">
                <a
                  className="govuk-link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setError("");
                    setStep("eligibility");
                  }}
                >
                  Try again
                </a>
              </p>
              <p className="govuk-body">
                <a href="/" className="govuk-link">
                  Return to services
                </a>
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
