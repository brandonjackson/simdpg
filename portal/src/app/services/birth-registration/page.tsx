"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";

type SexValue = "male" | "female" | "";

interface FormState {
  mother_national_id: string;
  father_national_id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string;
  sex: SexValue;
  place_of_birth: string;
}

const EMPTY_FORM: FormState = {
  mother_national_id: "",
  father_national_id: "",
  given_name: "",
  family_name: "",
  date_of_birth: "",
  sex: "",
  place_of_birth: "",
};

type Step = "details" | "review" | "confirmation";

export default function BirthRegistrationPage() {
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // OpenFn's webhook reply includes a work order ID; shown as the reference.
  const [reference, setReference] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStep("review");
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/forms/birth-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          father_national_id: form.father_national_id.trim() || null,
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
        <li className="govuk-breadcrumbs__list-item">Register a birth</li>
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

  // ── Step 1: enter details ────────────────────────────────────────────────
  if (step === "details") {
    return (
      <>
        {breadcrumbs}

        <h1 className="govuk-heading-xl">Register a birth</h1>
        <p className="govuk-body-l">
          Register the birth of a child. The child will be issued a citizen
          record, registered with the health service, and checked for child
          benefit automatically.
        </p>

        {errorSummary}

        <form onSubmit={handleContinue}>
          <h2 className="govuk-heading-m">Parents&rsquo; details</h2>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="mother_national_id">
              Mother&rsquo;s national ID
            </label>
            <div className="govuk-hint">For example, SIM-000001</div>
            <input
              className="govuk-input govuk-input--width-20"
              id="mother_national_id"
              type="text"
              value={form.mother_national_id}
              onChange={(e) => update("mother_national_id", e.target.value)}
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="father_national_id">
              Father&rsquo;s national ID (optional)
            </label>
            <input
              className="govuk-input govuk-input--width-20"
              id="father_national_id"
              type="text"
              value={form.father_national_id}
              onChange={(e) => update("father_national_id", e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <h2 className="govuk-heading-m">Child&rsquo;s details</h2>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="given_name">
              Given name
            </label>
            <input
              className="govuk-input govuk-input--width-20"
              id="given_name"
              type="text"
              value={form.given_name}
              onChange={(e) => update("given_name", e.target.value)}
              required
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="family_name">
              Family name
            </label>
            <input
              className="govuk-input govuk-input--width-20"
              id="family_name"
              type="text"
              value={form.family_name}
              onChange={(e) => update("family_name", e.target.value)}
              required
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="date_of_birth">
              Date of birth
            </label>
            <div className="govuk-hint">Format: YYYY-MM-DD</div>
            <input
              className="govuk-input govuk-input--width-10"
              id="date_of_birth"
              type="date"
              value={form.date_of_birth}
              onChange={(e) => update("date_of_birth", e.target.value)}
              required
            />
          </div>

          <div className="govuk-form-group">
            <fieldset className="govuk-fieldset">
              <legend className="govuk-fieldset__legend">Sex</legend>
              <div className="govuk-radios">
                <div className="govuk-radios__item">
                  <input
                    className="govuk-radios__input"
                    id="sex-male"
                    type="radio"
                    name="sex"
                    value="male"
                    checked={form.sex === "male"}
                    onChange={() => update("sex", "male")}
                    required
                  />
                  <label
                    className="govuk-label govuk-radios__label"
                    htmlFor="sex-male"
                  >
                    Male
                  </label>
                </div>
                <div className="govuk-radios__item">
                  <input
                    className="govuk-radios__input"
                    id="sex-female"
                    type="radio"
                    name="sex"
                    value="female"
                    checked={form.sex === "female"}
                    onChange={() => update("sex", "female")}
                  />
                  <label
                    className="govuk-label govuk-radios__label"
                    htmlFor="sex-female"
                  >
                    Female
                  </label>
                </div>
              </div>
            </fieldset>
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="place_of_birth">
              Place of birth
            </label>
            <div className="govuk-hint">
              For example, the hospital or town where the child was born
            </div>
            <input
              className="govuk-input"
              id="place_of_birth"
              type="text"
              value={form.place_of_birth}
              onChange={(e) => update("place_of_birth", e.target.value)}
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

  // ── Step 2: check answers ────────────────────────────────────────────────
  if (step === "review") {
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
            <dt className="govuk-summary-list__key">
              Mother&rsquo;s national ID
            </dt>
            <dd className="govuk-summary-list__value">
              {form.mother_national_id}
            </dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">
              Father&rsquo;s national ID
            </dt>
            <dd className="govuk-summary-list__value">
              {form.father_national_id.trim() || "Not provided"}
            </dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Child&rsquo;s name</dt>
            <dd className="govuk-summary-list__value">
              {form.given_name} {form.family_name}
            </dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Date of birth</dt>
            <dd className="govuk-summary-list__value">{form.date_of_birth}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Sex</dt>
            <dd className="govuk-summary-list__value">
              {form.sex === "male" ? "Male" : "Female"}
            </dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Place of birth</dt>
            <dd className="govuk-summary-list__value">
              {form.place_of_birth}
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

  // ── Step 3: confirmation ─────────────────────────────────────────────────
  return (
    <>
      <div className="govuk-panel govuk-panel--confirmation">
        <h1 className="govuk-panel__title">Birth registration submitted</h1>
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
        The registration is being processed. The child will be issued a citizen
        record and national ID, registered as a patient with the health
        service, and automatically checked for child benefit. The mother will
        receive email confirmations as each step completes.
      </p>

      <p className="govuk-body">
        <a
          className="govuk-link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setForm(EMPTY_FORM);
            setReference(null);
            setError("");
            setStep("details");
          }}
        >
          Register another birth
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
