"use client";

import { FormEvent, useState } from "react";

type Citizen = {
  id: string;
  given_name: string;
  family_name: string;
  national_id: string;
  email?: string;
  phone_number?: string;
};

export default function MarriageRegistrationPage() {
  const [spouse1NationalId, setSpouse1NationalId] = useState("");
  const [spouse2NationalId, setSpouse2NationalId] = useState("");
  const [dateOfMarriage, setDateOfMarriage] = useState("");
  const [placeOfMarriage, setPlaceOfMarriage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  async function lookupCitizen(id: string): Promise<Citizen> {
    const response = await fetch(`/api/proxy/identity/citizens/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Citizen not found for ID ${id}`);
    }

    return response.json();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    setResult(null);

    if (!spouse1NationalId || !spouse2NationalId || !dateOfMarriage || !placeOfMarriage) {
      setStatus("error");
      setMessage("Please complete all fields before submitting.");
      return;
    }

    try {
      const spouse1 = await lookupCitizen(spouse1NationalId.trim());
      const spouse2 = await lookupCitizen(spouse2NationalId.trim());

      const payload = {
        spouse_1_citizen_id: spouse1.id,
        spouse_2_citizen_id: spouse2.id,
        date_of_marriage: dateOfMarriage,
        place_of_marriage: placeOfMarriage,
      };

      const response = await fetch(`/api/services/marriage-registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Failed to register marriage.");
      }

      const data = await response.json();
      setStatus("success");
      setMessage("Marriage registration submitted successfully.");
      setResult(data);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "An unexpected error occurred.");
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
          <li className="govuk-breadcrumbs__list-item">Register a marriage</li>
        </ol>
      </nav>

      <h1 className="govuk-heading-xl">Register a marriage</h1>

      <p className="govuk-body">
        This form records a marriage between two citizens and submits the marriage record to
        Civil Registry. Provide your personal details along with your date and place of marriage.
      </p>

      <form className="govuk-form-group" onSubmit={handleSubmit}>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="spouse1">
            First spouse citizen ID
          </label>
          <input
            id="spouse1"
            name="spouse1"
            className="govuk-input"
            value={spouse1NationalId}
            onChange={(event) => setSpouse1NationalId(event.target.value)}
            placeholder="e.g. 9b2f8f7c-1a2b-4c3d-9e0f-1234567890ab"
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="spouse2">
            Second spouse citizen ID
          </label>
          <input
            id="spouse2"
            name="spouse2"
            className="govuk-input"
            value={spouse2NationalId}
            onChange={(event) => setSpouse2NationalId(event.target.value)}
            placeholder="e.g. 4d5c6b7a-8e9f-0a1b-2c3d-456789abcdef"
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="dateOfMarriage">
            Date of marriage
          </label>
          <input
            id="dateOfMarriage"
            name="dateOfMarriage"
            type="date"
            className="govuk-input"
            value={dateOfMarriage}
            onChange={(event) => setDateOfMarriage(event.target.value)}
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="placeOfMarriage">
            Place of marriage
          </label>
          <input
            id="placeOfMarriage"
            name="placeOfMarriage"
            className="govuk-input"
            value={placeOfMarriage}
            onChange={(event) => setPlaceOfMarriage(event.target.value)}
            placeholder="Capital City Registry Office"
          />
        </div>

        <button className="govuk-button" type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Registering…" : "Register marriage"}
        </button>
      </form>

      {message ? (
        <div
          className={
            status === "success"
              ? "govuk-notification-banner govuk-notification-banner--success"
              : "govuk-notification-banner govuk-notification-banner--error"
          }
          role="region"
          aria-live="polite"
        >
          <div className="govuk-notification-banner__content">
            <p className="govuk-body">{message}</p>
            {status === "success" && result ? (
              <pre className="govuk-body-s">{JSON.stringify(result, null, 2)}</pre>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
