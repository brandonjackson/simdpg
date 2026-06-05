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

type Step = "mother" | "father" | "child" | "review" | "success";

export default function RegisterBirth() {
  const [step, setStep] = useState<Step>("mother");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Mother
  const [motherNationalId, setMotherNationalId] = useState("");
  const [mother, setMother] = useState<CitizenInfo | null>(null);

  // Father
  const [fatherNationalId, setFatherNationalId] = useState("");
  const [father, setFather] = useState<CitizenInfo | null>(null);
  const [skipFather, setSkipFather] = useState(false);

  // Child
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [placeOfBirth, setPlaceOfBirth] = useState("");

  // Result
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

  async function handleMotherLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const citizen = await lookupCitizen(motherNationalId);
      setMother(citizen);
      setStep("father");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleFatherLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (skipFather) {
      setStep("child");
      return;
    }
    setLoading(true);
    try {
      const citizen = await lookupCitizen(fatherNationalId);
      setFather(citizen);
      setStep("child");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function handleChildDetails(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!givenName || !familyName || !dateOfBirth || !placeOfBirth) {
      setError("All fields are required");
      return;
    }
    setStep("review");
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      // First create the child citizen in the identity system
      const citizenRes = await fetch("/api/proxy/identity/citizens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          given_name: givenName,
          family_name: familyName,
          date_of_birth: dateOfBirth,
          sex,
        }),
      });
      if (!citizenRes.ok) {
        const data = await citizenRes.json();
        throw new Error(data.error || "Failed to create citizen record");
      }
      const childCitizen = await citizenRes.json();

      // Then register the birth in the civil registry
      const birthRes = await fetch("/api/proxy/civil-registry/births", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_citizen_id: childCitizen.id,
          mother_citizen_id: mother!.id,
          father_citizen_id: father?.id || undefined,
          date_of_birth: dateOfBirth,
          place_of_birth: placeOfBirth,
        }),
      });
      if (!birthRes.ok) {
        const data = await birthRes.json();
        throw new Error(data.error || "Failed to register birth");
      }
      const birth = await birthRes.json();
      setRegistrationId(birth.id);
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
          <h1 className="govuk-panel__title">Birth registered</h1>
          <div className="govuk-panel__body">
            Registration reference
            <br />
            <strong>{registrationId}</strong>
          </div>
        </div>
        <p className="govuk-body" style={{ marginTop: 30 }}>
          The birth of{" "}
          <strong>
            {givenName} {familyName}
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
          <li className="govuk-breadcrumbs__list-item">Register a birth</li>
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

      {step === "mother" && (
        <form onSubmit={handleMotherLookup}>
          <div className="govuk-step-indicator">Step 1 of 4</div>
          <div className="govuk-form-group">
            <label className="govuk-label govuk-label--l" htmlFor="mother-nid">
              What is the mother&apos;s national ID?
            </label>
            <div className="govuk-hint">
              Enter the national identity number as it appears on their ID card.
            </div>
            <input
              className="govuk-input govuk-input--width-20"
              id="mother-nid"
              type="text"
              value={motherNationalId}
              onChange={(e) => setMotherNationalId(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button className="govuk-button" type="submit" disabled={loading}>
            {loading ? "Looking up..." : "Continue"}
          </button>
        </form>
      )}

      {step === "father" && (
        <form onSubmit={handleFatherLookup}>
          <div className="govuk-step-indicator">Step 2 of 4</div>

          {mother && (
            <div className="govuk-citizen-confirmed">
              <p className="govuk-citizen-confirmed__name">
                {mother.given_name} {mother.family_name}
              </p>
              <p className="govuk-citizen-confirmed__details">
                National ID: {mother.national_id} &middot; DOB:{" "}
                {mother.date_of_birth}
              </p>
            </div>
          )}

          <div className="govuk-form-group">
            <label className="govuk-label govuk-label--l" htmlFor="father-nid">
              What is the father&apos;s national ID?
            </label>
            <div className="govuk-hint">
              This is optional. Leave blank if not applicable.
            </div>
            <input
              className="govuk-input govuk-input--width-20"
              id="father-nid"
              type="text"
              value={fatherNationalId}
              onChange={(e) => {
                setFatherNationalId(e.target.value);
                setSkipFather(false);
              }}
              disabled={skipFather}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label>
              <input
                type="checkbox"
                checked={skipFather}
                onChange={(e) => {
                  setSkipFather(e.target.checked);
                  if (e.target.checked) setFatherNationalId("");
                }}
              />{" "}
              Father&apos;s details not available
            </label>
          </div>
          <button className="govuk-button" type="submit" disabled={loading}>
            {loading ? "Looking up..." : "Continue"}
          </button>
          <br />
          <button
            type="button"
            className="govuk-button govuk-button--secondary"
            onClick={() => {
              setStep("mother");
              setMother(null);
            }}
            style={{ marginLeft: 0 }}
          >
            Back
          </button>
        </form>
      )}

      {step === "child" && (
        <form onSubmit={handleChildDetails}>
          <div className="govuk-step-indicator">Step 3 of 4</div>
          <h1 className="govuk-heading-l">Child&apos;s details</h1>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="given-name">
              Given name
            </label>
            <input
              className="govuk-input govuk-input--width-20"
              id="given-name"
              type="text"
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="family-name">
              Family name
            </label>
            <input
              className="govuk-input govuk-input--width-20"
              id="family-name"
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              required
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="dob">
              Date of birth
            </label>
            <div className="govuk-hint">For example, 2024-03-15</div>
            <input
              className="govuk-input govuk-input--width-10"
              id="dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
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
                    name="sex"
                    type="radio"
                    value="male"
                    checked={sex === "male"}
                    onChange={() => setSex("male")}
                  />
                  <label className="govuk-radios__label" htmlFor="sex-male">
                    Male
                  </label>
                </div>
                <div className="govuk-radios__item">
                  <input
                    className="govuk-radios__input"
                    id="sex-female"
                    name="sex"
                    type="radio"
                    value="female"
                    checked={sex === "female"}
                    onChange={() => setSex("female")}
                  />
                  <label className="govuk-radios__label" htmlFor="sex-female">
                    Female
                  </label>
                </div>
              </div>
            </fieldset>
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="place-of-birth">
              Place of birth
            </label>
            <input
              className="govuk-input govuk-input--width-20"
              id="place-of-birth"
              type="text"
              value={placeOfBirth}
              onChange={(e) => setPlaceOfBirth(e.target.value)}
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
            onClick={() => setStep("father")}
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
              <dt className="govuk-summary-list__key">Mother</dt>
              <dd className="govuk-summary-list__value">
                {mother?.given_name} {mother?.family_name} ({mother?.national_id}
                )
              </dd>
              <dd className="govuk-summary-list__actions">
                <a
                  href="#"
                  className="govuk-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setStep("mother");
                  }}
                >
                  Change
                </a>
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Father</dt>
              <dd className="govuk-summary-list__value">
                {father
                  ? `${father.given_name} ${father.family_name} (${father.national_id})`
                  : "Not provided"}
              </dd>
              <dd className="govuk-summary-list__actions">
                <a
                  href="#"
                  className="govuk-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setStep("father");
                  }}
                >
                  Change
                </a>
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Child&apos;s name</dt>
              <dd className="govuk-summary-list__value">
                {givenName} {familyName}
              </dd>
              <dd className="govuk-summary-list__actions">
                <a
                  href="#"
                  className="govuk-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setStep("child");
                  }}
                >
                  Change
                </a>
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Date of birth</dt>
              <dd className="govuk-summary-list__value">{dateOfBirth}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Sex</dt>
              <dd className="govuk-summary-list__value">
                {sex.charAt(0).toUpperCase() + sex.slice(1)}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Place of birth</dt>
              <dd className="govuk-summary-list__value">{placeOfBirth}</dd>
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
            {loading ? "Registering..." : "Register birth"}
          </button>
          <br />
          <button
            className="govuk-button govuk-button--secondary"
            onClick={() => setStep("child")}
          >
            Back
          </button>
        </>
      )}
    </>
  );
}
