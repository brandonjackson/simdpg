"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";

type SexValue = "male" | "female" | "";

interface FormState {
  given_name: string;
  family_name: string;
  date_of_birth: string;
  sex: SexValue;
  address_line_1: string;
  city: string;
  postal_code: string;
  email: string;
  phone_number: string;
}

const EMPTY_FORM: FormState = {
  given_name: "",
  family_name: "",
  date_of_birth: "",
  sex: "",
  address_line_1: "",
  city: "",
  postal_code: "",
  email: "",
  phone_number: "",
};

// Mirrors `ApplicationResult` from the API (lib/national-id.ts).
type Outcome =
  | { status: "created"; national_id: string; notified: boolean }
  | { status: "existing"; national_id: string; notified: boolean }
  | {
      status: "review";
      reason: string;
      candidates: { national_id: string; name: string; date_of_birth: string }[];
    }
  | { status: "queued"; reason: string };

export default function DigitalIdentityApplication() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/apply/national-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email || null,
          phone_number: form.phone_number || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(errorMessage(data, "Your application could not be processed."));
      }
      setOutcome(data as Outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your application could not be processed.");
    } finally {
      setLoading(false);
    }
  }

  function applyAgain() {
    setForm(EMPTY_FORM);
    setOutcome(null);
    setError("");
  }

  const breadcrumbs = (
    <nav className="govuk-breadcrumbs" aria-label="Breadcrumb">
      <ol className="govuk-breadcrumbs__list">
        <li className="govuk-breadcrumbs__list-item">
          <a className="govuk-breadcrumbs__link" href="/">
            Home
          </a>
        </li>
        <li className="govuk-breadcrumbs__list-item">Apply for a national ID</li>
      </ol>
    </nav>
  );

  // ── Confirmation: an ID was issued or already existed ────────────────────
  if (outcome && (outcome.status === "created" || outcome.status === "existing")) {
    const isExisting = outcome.status === "existing";
    return (
      <>
        {breadcrumbs}

        <div className="govuk-panel govuk-panel--confirmation">
          <h1 className="govuk-panel__title">
            {isExisting ? "You already have a national ID" : "Application complete"}
          </h1>
          <div className="govuk-panel__body">
            Your national ID
            <br />
            <strong>{outcome.national_id}</strong>
          </div>
        </div>

        {isExisting && (
          <p className="govuk-body">
            Our records show you already have a national ID, so a new one was not
            issued.
          </p>
        )}

        <p className="govuk-body">
          {outcome.notified
            ? "A confirmation has been sent to your contact details."
            : "We could not send a confirmation message, but your national ID is shown above."}
        </p>

        <button className="govuk-button govuk-button--secondary" onClick={applyAgain}>
          Make another application
        </button>
        <p className="govuk-body">
          <a href="/" className="govuk-link">
            Back to services
          </a>
        </p>
      </>
    );
  }

  // ── Flagged for manual review (near-duplicate) ───────────────────────────
  if (outcome && outcome.status === "review") {
    return (
      <>
        {breadcrumbs}
        <h1 className="govuk-heading-xl">Application received</h1>
        <div className="govuk-inset-text">{outcome.reason}</div>

        {outcome.candidates.length > 0 && (
          <>
            <h2 className="govuk-heading-m">Existing records being reviewed</h2>
            <table className="govuk-table">
              <thead>
                <tr>
                  <th className="govuk-table__header">National ID</th>
                  <th className="govuk-table__header">Name</th>
                  <th className="govuk-table__header">Date of birth</th>
                </tr>
              </thead>
              <tbody>
                {outcome.candidates.map((c) => (
                  <tr key={c.national_id}>
                    <td className="govuk-table__cell">{c.national_id}</td>
                    <td className="govuk-table__cell">{c.name}</td>
                    <td className="govuk-table__cell">{c.date_of_birth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <button className="govuk-button govuk-button--secondary" onClick={applyAgain}>
          Start a new application
        </button>
        <p className="govuk-body">
          <a href="/" className="govuk-link">
            Back to services
          </a>
        </p>
      </>
    );
  }

  // ── Queued for retry (Identity unavailable) ──────────────────────────────
  if (outcome && outcome.status === "queued") {
    return (
      <>
        {breadcrumbs}
        <h1 className="govuk-heading-xl">Application queued</h1>
        <div className="govuk-inset-text">{outcome.reason}</div>
        <button className="govuk-button" onClick={applyAgain}>
          Try again
        </button>
      </>
    );
  }

  // ── The form ─────────────────────────────────────────────────────────────
  return (
    <>
      {breadcrumbs}

      <h1 className="govuk-heading-xl">Apply for a national ID</h1>
      <p className="govuk-body-l">
        Provide your personal details and a residential address. We will check
        for an existing record and issue a national ID (SIM-XXXXXX format) if you
        do not already have one.
      </p>

      {error && (
        <div className="govuk-error-summary" role="alert">
          <h2 className="govuk-error-summary__title">There is a problem</h2>
          <ul className="govuk-error-summary__list">
            <li>{error}</li>
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <h2 className="govuk-heading-m">Your details</h2>

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
            autoFocus
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
                <label className="govuk-label govuk-radios__label" htmlFor="sex-male">
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
                <label className="govuk-label govuk-radios__label" htmlFor="sex-female">
                  Female
                </label>
              </div>
            </div>
          </fieldset>
        </div>

        <h2 className="govuk-heading-m">Residential address</h2>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="address_line_1">
            Address line 1
          </label>
          <input
            className="govuk-input"
            id="address_line_1"
            type="text"
            value={form.address_line_1}
            onChange={(e) => update("address_line_1", e.target.value)}
            required
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="city">
            Town or city
          </label>
          <input
            className="govuk-input govuk-input--width-20"
            id="city"
            type="text"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            required
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="postal_code">
            Postal code
          </label>
          <input
            className="govuk-input govuk-input--width-10"
            id="postal_code"
            type="text"
            value={form.postal_code}
            onChange={(e) => update("postal_code", e.target.value)}
            required
          />
        </div>

        <h2 className="govuk-heading-m">Contact details</h2>
        <p className="govuk-hint">
          Provide an email address or phone number so we can confirm your national
          ID.
        </p>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="email">
            Email address
          </label>
          <input
            className="govuk-input govuk-input--width-20"
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="phone_number">
            Phone number
          </label>
          <input
            className="govuk-input govuk-input--width-20"
            id="phone_number"
            type="tel"
            value={form.phone_number}
            onChange={(e) => update("phone_number", e.target.value)}
          />
        </div>

        <button className="govuk-button" type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit application"}
        </button>
      </form>

      {loading && <div className="govuk-loading">Processing your application</div>}
    </>
  );
}
