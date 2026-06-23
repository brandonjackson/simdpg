"use client";

import { useEffect, useState } from "react";
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
      candidates: {
        national_id: string;
        name: string;
        date_of_birth: string;
      }[];
    }
  | { status: "queued"; reason: string }
  // OpenFn webhook path: the workflow accepts the application and returns a
  // work order ID. A missing work order ID means the submission failed.
  | { status: "submitted"; work_order_id: string };

export default function DigitalIdentityApplication() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Auto-dismiss the confirmation message after a short while.
  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), 8000);
    return () => clearTimeout(timer);
  }, [outcome]);

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
        throw new Error(
          errorMessage(data, "Your application could not be processed."),
        );
      }
      // The OpenFn webhook path returns { work_order_id }; the direct
      // orchestration path returns a { status } outcome. Normalise both.
      let result: Outcome;
      if (data && typeof data.work_order_id === "string") {
        result = { status: "submitted", work_order_id: data.work_order_id };
      } else if (
        data &&
        ["created", "existing", "review", "queued"].includes(data.status)
      ) {
        result = data as Outcome;
      } else {
        throw new Error("Your application could not be processed.");
      }
      setOutcome(result);
      // Clear all entries after a successful submission.
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Your application could not be processed.",
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
        <li className="govuk-breadcrumbs__list-item">
          Apply for a national ID
        </li>
      </ol>
    </nav>
  );

  // Build the confirmation message shown beneath the submit button. Every
  // status produces a heading and body so the banner is never empty.
  function confirmation(o: Outcome): {
    success: boolean;
    heading: string;
    body: React.ReactNode;
  } {
    switch (o.status) {
      case "created":
        return {
          success: true,
          heading: "Application submitted",
          body: (
            <>
              Your national ID is <strong>{o.national_id}</strong>.{" "}
              {o.notified
                ? "A confirmation has been sent to your contact details."
                : "We could not send a confirmation message, but your national ID is shown above."}
            </>
          ),
        };
      case "existing":
        return {
          success: true,
          heading: "You already have a national ID",
          body: (
            <>
              Our records show you already have a national ID (
              <strong>{o.national_id}</strong>), so a new one was not issued.
            </>
          ),
        };
      case "review":
        return {
          success: false,
          heading: "Application received",
          body:
            o.reason ||
            "Your application is being reviewed against existing records.",
        };
      case "queued":
        return {
          success: false,
          heading: "Application queued",
          body:
            o.reason ||
            "The service is busy. Your application has been queued and will be processed shortly.",
        };
      case "submitted":
        return {
          success: true,
          heading: "Application submitted",
          body: (
            <>
              Your application has been received. Your reference is{" "}
              <strong>{o.work_order_id}</strong>.
            </>
          ),
        };
      default:
        return {
          success: true,
          heading: "Application submitted",
          body: "Your application has been received.",
        };
    }
  }

  // ── The form ─────────────────────────────────────────────────────────────
  return (
    <>
      {breadcrumbs}

      <h1 className="govuk-heading-xl">Apply for a national ID</h1>
      <p className="govuk-body-l">
        Provide your personal details and a residential address. We will check
        for an existing record and issue a national ID (SIM-XXXXXX format) if
        you do not already have one.
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
          Provide an email address or phone number so we can confirm your
          national ID.
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

        {outcome &&
          (() => {
            const c = confirmation(outcome);
            return (
              <div
                className={`form-confirmation${
                  c.success ? " form-confirmation--success" : ""
                }`}
                role="status"
                aria-live="polite"
              >
                <span className="form-confirmation__icon" aria-hidden="true">
                  {c.success ? "✓" : "!"}
                </span>
                <span className="form-confirmation__text">
                  <strong className="form-confirmation__heading">
                    {c.heading}
                  </strong>
                  <span className="form-confirmation__body">{c.body}</span>
                </span>
              </div>
            );
          })()}
      </form>

      {loading && (
        <div className="govuk-loading">Processing your application</div>
      )}
    </>
  );
}
