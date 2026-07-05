"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";

interface Citizen {
  id: string;
  national_id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string;
  status: "alive" | "deceased";
  date_of_death: string | null;
}

interface DeathDetails {
  date_of_death: string;
  place_of_death: string;
  cause_of_death: string;
}

const EMPTY_DETAILS: DeathDetails = {
  date_of_death: "",
  place_of_death: "",
  cause_of_death: "",
};

type Step = "lookup" | "details" | "review" | "confirmation";

export default function DeathRegistrationPage() {
  const [step, setStep] = useState<Step>("lookup");
  const [nationalId, setNationalId] = useState("");
  const [citizen, setCitizen] = useState<Citizen | null>(null);
  const [details, setDetails] = useState<DeathDetails>(EMPTY_DETAILS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // OpenFn's webhook reply includes a work order ID; shown as the reference.
  const [reference, setReference] = useState<string | null>(null);

  function updateDetails<K extends keyof DeathDetails>(
    key: K,
    value: DeathDetails[K],
  ) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setNationalId("");
    setCitizen(null);
    setDetails(EMPTY_DETAILS);
    setReference(null);
    setError("");
    setStep("lookup");
  }

  // ── Step 1: look up the deceased by national ID ──────────────────────────
  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!nationalId.trim()) {
      setError("Enter the deceased person's national ID");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/lookup?type=citizen&national_id=${encodeURIComponent(
          nationalId.trim(),
        )}`,
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          errorMessage(
            data,
            "No citizen found with that national ID. Check the number and try again.",
          ),
        );
      }
      setCitizen(data as Citizen);
      setStep("details");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The deceased person's record could not be found.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDetailsContinue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStep("review");
  }

  // ── Step 3: submit the registration ──────────────────────────────────────
  async function handleSubmit() {
    if (!citizen) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/forms/death-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          national_id: citizen.national_id,
          citizen_id: citizen.id,
          // Alias so workflows that key off `state.data.id` work unchanged.
          id: citizen.id,
          date_of_death: details.date_of_death,
          place_of_death: details.place_of_death.trim(),
          cause_of_death: details.cause_of_death.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      // OpenFn wraps sync replies: { data: <job output>, meta: {...} }
      const data = json?.data ?? json;
      if (!res.ok) {
        throw new Error(
          errorMessage(data, "Your registration could not be processed."),
        );
      }
      setReference(
        json && typeof json.work_order_id === "string"
          ? json.work_order_id
          : null,
      );
      setStep("confirmation");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Your registration could not be processed.",
      );
    } finally {
      setLoading(false);
    }
  }

  const breadcrumbs = (
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
  );

  const errorSummary = error && (
    <div className="govuk-error-summary" role="alert">
      <h2 className="govuk-error-summary__title">There is a problem</h2>
      <ul className="govuk-error-summary__list">
        <li>{error}</li>
      </ul>
    </div>
  );

  const deceasedName = citizen
    ? `${citizen.given_name} ${citizen.family_name}`
    : "";

  // ── Step 1: enter national ID ────────────────────────────────────────────
  if (step === "lookup") {
    return (
      <>
        {breadcrumbs}

        <h1 className="govuk-heading-xl">Register a death</h1>
        <p className="govuk-body-l">
          Register the death of a citizen. Their record will be updated across
          the civil registry, identity, health, and benefits systems
          automatically.
        </p>

        {errorSummary}

        <form onSubmit={handleLookup} noValidate>
          <div
            className={`govuk-form-group${
              error ? " govuk-form-group--error" : ""
            }`}
          >
            <label className="govuk-label govuk-label--m" htmlFor="national_id">
              Deceased person&rsquo;s national ID
            </label>
            <div className="govuk-hint">For example, SIM-000001</div>
            {error && <p className="govuk-error-message">{error}</p>}
            <input
              className={`govuk-input govuk-input--width-20${
                error ? " govuk-input--error" : ""
              }`}
              id="national_id"
              type="text"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              required
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
    );
  }

  // ── Step 2: confirm identity & enter death details ───────────────────────
  if (step === "details" && citizen) {
    return (
      <>
        <a
          className="govuk-back-link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setError("");
            setStep("lookup");
          }}
        >
          Back
        </a>

        <h1 className="govuk-heading-xl">Enter the death details</h1>

        <div className="govuk-inset-text">
          <p className="govuk-body govuk-!-margin-bottom-0">
            You are registering the death of <strong>{deceasedName}</strong>{" "}
            (national ID {citizen.national_id}, born {citizen.date_of_birth}).
          </p>
        </div>

        {citizen.status === "deceased" && (
          <div className="govuk-warning-text">
            <span className="govuk-warning-text__icon" aria-hidden="true">
              !
            </span>
            <strong className="govuk-warning-text__text">
              <span className="govuk-visually-hidden">Warning: </span>
              This citizen is already recorded as deceased
              {citizen.date_of_death ? ` (${citizen.date_of_death})` : ""}.
              Submitting again may be rejected as a duplicate.
            </strong>
          </div>
        )}

        {errorSummary}

        <form onSubmit={handleDetailsContinue}>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="date_of_death">
              Date of death
            </label>
            <div className="govuk-hint">Format: YYYY-MM-DD</div>
            <input
              className="govuk-input govuk-input--width-10"
              id="date_of_death"
              type="date"
              value={details.date_of_death}
              onChange={(e) => updateDetails("date_of_death", e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="place_of_death">
              Place of death
            </label>
            <div className="govuk-hint">
              For example, the hospital or town where the death occurred
            </div>
            <input
              className="govuk-input"
              id="place_of_death"
              type="text"
              value={details.place_of_death}
              onChange={(e) => updateDetails("place_of_death", e.target.value)}
              required
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="cause_of_death">
              Cause of death
            </label>
            <div className="govuk-hint">
              For example, natural causes, or a specific medical cause
            </div>
            <input
              className="govuk-input"
              id="cause_of_death"
              type="text"
              value={details.cause_of_death}
              onChange={(e) => updateDetails("cause_of_death", e.target.value)}
              required
            />
          </div>

          <button className="govuk-button" type="submit">
            Continue
          </button>
        </form>
      </>
    );
  }

  // ── Step 3: check answers ────────────────────────────────────────────────
  if (step === "review" && citizen) {
    return (
      <>
        <a
          className="govuk-back-link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setError("");
            setStep("details");
          }}
        >
          Back
        </a>

        <h1 className="govuk-heading-xl">Check your answers</h1>

        {errorSummary}

        <dl className="govuk-summary-list">
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Deceased</dt>
            <dd className="govuk-summary-list__value">{deceasedName}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">National ID</dt>
            <dd className="govuk-summary-list__value">{citizen.national_id}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Date of death</dt>
            <dd className="govuk-summary-list__value">
              {details.date_of_death}
            </dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Place of death</dt>
            <dd className="govuk-summary-list__value">
              {details.place_of_death}
            </dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Cause of death</dt>
            <dd className="govuk-summary-list__value">
              {details.cause_of_death}
            </dd>
          </div>
        </dl>

        <button
          className="govuk-button"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Submitting..." : "Submit registration"}
        </button>

        {loading && (
          <div className="govuk-loading">Processing your registration</div>
        )}
      </>
    );
  }

  // ── Step 4: confirmation ─────────────────────────────────────────────────
  return (
    <>
      <div className="govuk-panel govuk-panel--confirmation">
        <h1 className="govuk-panel__title">Death registration submitted</h1>
        {reference && (
          <div className="govuk-panel__body">
            Your reference
            <br />
            <strong>{reference}</strong>
          </div>
        )}
      </div>

      <h2 className="govuk-heading-m">What happens next</h2>
      <p className="govuk-body">
        The registration is being processed. The death will be recorded in the
        civil registry, the citizen&rsquo;s status will be updated to deceased in
        the identity system, and any active benefit enrolments and payments will
        be closed. Next of kin will receive confirmation as each step completes.
      </p>

      <p className="govuk-body">
        <a
          className="govuk-link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            resetForm();
          }}
        >
          Register another death
        </a>
      </p>
      <p className="govuk-body">
        <a href="/" className="govuk-link">
          Return to services
        </a>
      </p>
    </>
  );
}
