"use client";

import { FormEvent, useState } from "react";
import { formHooksForService } from "@/lib/form-hooks";

const HOOK = formHooksForService("marriage-registration")[0];

async function callWorkflow(payload: Record<string, unknown>) {
  const res = await fetch(`/api/forms/${encodeURIComponent(HOOK.key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  const data = json?.data ?? json;
  return { ok: res.ok, data };
}

type Step = "details" | "success";

export default function MarriageRegistrationPage() {
  const [step, setStep] = useState<Step>("details");
  const [spouse1NationalId, setSpouse1NationalId] = useState("");
  const [spouse2NationalId, setSpouse2NationalId] = useState("");
  const [dateOfMarriage, setDateOfMarriage] = useState("");
  const [placeOfMarriage, setPlaceOfMarriage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

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
      const payload: Record<string, unknown> = {
        spouse_1_national_id: spouse1NationalId.trim(),
        spouse_2_national_id: spouse2NationalId.trim(),
        date_of_marriage: dateOfMarriage,
        place_of_marriage: placeOfMarriage,
      };

      const { ok, data } = await callWorkflow(payload);
      if (!ok || data?.success === false || data?.error) {
        throw new Error(data?.error || data?.message || "Marriage registration failed.");
      }

      const registrationNumber =
        data?.marriage_registration_number ??
        data?.marriage_id ??
        data?.id ??
        null;

      setResult(data);
      setStatus("success");
      setMessage(
        registrationNumber
          ? `Marriage registration submitted successfully. Registration number: ${registrationNumber}`
          : "Marriage registration submitted successfully.",
      );
      setStep("success");
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

      {step === "details" && (
      <form className="govuk-form-group" onSubmit={handleSubmit}>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="spouse1">
            First spouse national ID
          </label>
          <input
            id="spouse1"
            name="spouse1"
            className="govuk-input"
            value={spouse1NationalId}
            onChange={(event) => setSpouse1NationalId(event.target.value)}
            placeholder="e.g. SIM-000123"
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="spouse2">
            Second spouse national ID
          </label>
          <input
            id="spouse2"
            name="spouse2"
            className="govuk-input"
            value={spouse2NationalId}
            onChange={(event) => setSpouse2NationalId(event.target.value)}
            placeholder="e.g. SIM-000456"
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
          {status === "loading" ? "Submitting…" : "Submit registration"}
        </button>
      </form>
      )}

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
