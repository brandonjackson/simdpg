"use client";

import { useState } from "react";
import { formHooksForService } from "@/lib/form-hooks";

// Form hooks for this service, in catalog order: [lookup, preview, confirm] =
// steps 1, 2, 3. Each submits through the central /api/forms/[key] endpoint.
const STEP_HOOKS = formHooksForService("death-registration");

async function callWorkflow(part: 1 | 2 | 3, payload: Record<string, unknown>) {
  const hook = STEP_HOOKS[part - 1];
  const res = await fetch(`/api/forms/${encodeURIComponent(hook.key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  const data = json?.data ?? json;
  return { ok: res.ok, data };
}

type Step = "national-id" | "details" | "preview" | "success";

export default function DeathRegistrationPage() {
  const [step, setStep] = useState<Step>("national-id");
  
  // Step 1 State
  const [nationalId, setNationalId] = useState("");
  const [citizenData, setCitizenData] = useState<any>(null);
  
  // Step 2 State
  const [dateOfDeath, setDateOfDeath] = useState("");
  const [placeOfDeath, setPlaceOfDeath] = useState("");
  const [causeOfDeath, setCauseOfDeath] = useState("");
  
  // Step 3 State
  const [previewData, setPreviewData] = useState<any>(null);

  // Global UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!nationalId.trim()) {
      setError("Enter the deceased's national ID");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { ok, data } = await callWorkflow(1, { national_id: nationalId.trim() });
      if (!ok || data.error || data.status === "deceased") {
        throw new Error(data.message || data.error || (data.status === "deceased" ? "This citizen is already registered as deceased." : "Lookup failed"));
      }
      setCitizenData(data);
      setStep("details");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dateOfDeath || !placeOfDeath || !causeOfDeath) {
      setError("Please fill in all the required death details");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { ok, data } = await callWorkflow(2, {
        citizen_data: citizenData,
        userInput: {
          dateOfDeath,
          placeOfDeath,
          causeOfDeath
        }
      });
      if (!ok || data.error) {
        throw new Error(data.message || data.error || "Failed to process death details");
      }
      setPreviewData(data);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process details");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setError("");
    setLoading(true);
    try {
      const { ok, data } = await callWorkflow(3, previewData);
      if (!ok || data.error) {
        throw new Error(data.error || data.message || "Failed to confirm death registration");
      }
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
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
          <li className="govuk-breadcrumbs__list-item">Register a death</li>
        </ol>
      </nav>

      {/* Step 1: Lookup */}
      {step === "national-id" && (
        <>
          <h1 className="govuk-heading-xl">Register a death</h1>
          <p className="govuk-body-l">
            Register a death and obtain a death certificate reference.
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
                Deceased's National ID number
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

      {/* Step 2: Details Input */}
      {step === "details" && citizenData && (
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

          <h1 className="govuk-heading-xl">Death details</h1>

          <h2 className="govuk-heading-m">Citizen record</h2>
          <dl className="govuk-summary-list govuk-!-margin-bottom-7">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Name</dt>
              <dd className="govuk-summary-list__value">{citizenData.given_name} {citizenData.family_name}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">National ID</dt>
              <dd className="govuk-summary-list__value">{citizenData.national_id}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Status</dt>
              <dd className="govuk-summary-list__value">
                <strong className={`govuk-tag ${citizenData.status === 'alive' ? 'govuk-tag--green' : 'govuk-tag--grey'}`}>
                  {citizenData.status}
                </strong>
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Date of birth</dt>
              <dd className="govuk-summary-list__value">{citizenData.date_of_birth}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Sex</dt>
              <dd className="govuk-summary-list__value" style={{ textTransform: 'capitalize' }}>{citizenData.sex}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Contact details</dt>
              <dd className="govuk-summary-list__value">
                {citizenData.email && <div>Email: {citizenData.email}</div>}
                {citizenData.phone_number && <div>Phone: {citizenData.phone_number}</div>}
                {!citizenData.email && !citizenData.phone_number && <span className="govuk-hint">None on record</span>}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Address</dt>
              <dd className="govuk-summary-list__value">
                {citizenData.addresses?.[0] ? (
                  <>
                    {citizenData.addresses[0].line_1}<br />
                    {citizenData.addresses[0].line_2 && <>{citizenData.addresses[0].line_2}<br /></>}
                    {citizenData.addresses[0].city}<br />
                    {citizenData.addresses[0].postal_code}
                  </>
                ) : (
                  <span className="govuk-hint">No address on record</span>
                )}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Record created</dt>
              <dd className="govuk-summary-list__value">{new Date(citizenData.created_at).toLocaleString()}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Last updated</dt>
              <dd className="govuk-summary-list__value">{new Date(citizenData.updated_at).toLocaleString()}</dd>
            </div>
          </dl>

          {error && (
            <div className="govuk-error-summary" role="alert">
              <h2 className="govuk-error-summary__title">There is a problem</h2>
              <ul className="govuk-error-summary__list">
                <li>{error}</li>
              </ul>
            </div>
          )}

          <form onSubmit={handleDetailsSubmit} noValidate>
            <div className="govuk-form-group">
              <label className="govuk-label govuk-label--s" htmlFor="date-of-death">
                Date of death
              </label>
              <input
                className="govuk-input govuk-input--width-20"
                id="date-of-death"
                type="date"
                value={dateOfDeath}
                onChange={(e) => setDateOfDeath(e.target.value)}
                required
              />
            </div>

            <div className="govuk-form-group">
              <label className="govuk-label govuk-label--s" htmlFor="place-of-death">
                Place of death
              </label>
              <input
                className="govuk-input"
                id="place-of-death"
                type="text"
                value={placeOfDeath}
                onChange={(e) => setPlaceOfDeath(e.target.value)}
                required
              />
            </div>

            <div className="govuk-form-group">
              <label className="govuk-label govuk-label--s" htmlFor="cause-of-death">
                Cause of death
              </label>
              <input
                className="govuk-input"
                id="cause-of-death"
                type="text"
                value={causeOfDeath}
                onChange={(e) => setCauseOfDeath(e.target.value)}
                required
              />
            </div>

            <button
              className="govuk-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Processing..." : "Continue"}
            </button>
          </form>
        </>
      )}

      {/* Step 3: Preview */}
      {step === "preview" && previewData && (
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

          <h1 className="govuk-heading-xl">Confirm death registration</h1>

          {error && (
            <div className="govuk-error-summary" role="alert">
              <h2 className="govuk-error-summary__title">There is a problem</h2>
              <ul className="govuk-error-summary__list">
                <li>{error}</li>
              </ul>
            </div>
          )}

          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Name</dt>
              <dd className="govuk-summary-list__value">
                {previewData.citizen_data?.given_name} {previewData.citizen_data?.family_name}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">National ID</dt>
              <dd className="govuk-summary-list__value">{previewData.citizen_data?.national_id}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Date of death</dt>
              <dd className="govuk-summary-list__value">{previewData.deathRegistration?.dateOfDeath}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Place of death</dt>
              <dd className="govuk-summary-list__value">{previewData.deathRegistration?.placeOfDeath}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Cause of death</dt>
              <dd className="govuk-summary-list__value">{previewData.deathRegistration?.causeOfDeath}</dd>
            </div>
          </dl>

          {!previewData.enrollment_found && !previewData.payment_found && (
            <div className="govuk-inset-text">
              No active benefit enrolments or pending payments were found for this citizen.
            </div>
          )}

          {previewData.enrollment_found && (
            <div className="govuk-!-margin-top-6 govuk-!-margin-bottom-6">
              <h2 className="govuk-heading-m">Active benefit enrolments to be terminated</h2>
              {(Array.isArray(previewData.enrollment_data) ? previewData.enrollment_data : previewData.enrollment_data?.data || []).map((item: any, i: number) => (
                <dl key={i} className="govuk-summary-list govuk-!-margin-bottom-4" style={{ borderLeft: "4px solid #d4351c", paddingLeft: "15px" }}>
                  {Object.entries(item).filter(([k]) => k !== 'citizen_id').map(([key, value]) => (
                    <div key={key} className="govuk-summary-list__row">
                      <dt className="govuk-summary-list__key" style={{ textTransform: "capitalize" }}>{key.replace(/_/g, ' ')}</dt>
                      <dd className="govuk-summary-list__value">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              ))}
            </div>
          )}

          {previewData.payment_found && (
            <div className="govuk-!-margin-top-6 govuk-!-margin-bottom-6">
              <h2 className="govuk-heading-m">Pending payments to be cancelled</h2>
              {(Array.isArray(previewData.payment_data) ? previewData.payment_data : previewData.payment_data?.data || []).map((item: any, i: number) => (
                <dl key={i} className="govuk-summary-list govuk-!-margin-bottom-4" style={{ borderLeft: "4px solid #d4351c", paddingLeft: "15px" }}>
                  {Object.entries(item).filter(([k]) => k !== 'citizen_id').map(([key, value]) => (
                    <div key={key} className="govuk-summary-list__row">
                      <dt className="govuk-summary-list__key" style={{ textTransform: "capitalize" }}>{key.replace(/_/g, ' ')}</dt>
                      <dd className="govuk-summary-list__value">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              ))}
            </div>
          )}

          {(previewData.enrollment_found || previewData.payment_found) && (
            <div className="govuk-warning-text">
              <span className="govuk-warning-text__icon" aria-hidden="true">!</span>
              <strong className="govuk-warning-text__text">
                <span className="govuk-visually-hidden">Warning</span>
                Warning: Upon confirmation, the active records listed above will be automatically cancelled.
              </strong>
            </div>
          )}

          <button
            className="govuk-button"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Confirming..." : "Confirm and register death"}
          </button>
        </>
      )}

      {/* Step 4: Success */}
      {step === "success" && (
        <>
          <div className="govuk-panel govuk-panel--confirmation">
            <h1 className="govuk-panel__title">Registration complete</h1>
            <div className="govuk-panel__body">
              The death has been officially registered.
            </div>
          </div>

          <p className="govuk-body">
            The citizen's records across all systems (Identity, Health, Benefits) have been marked as deceased and any active enrolments have been terminated.
          </p>

          <p className="govuk-body">
            <a href="/" className="govuk-link">
              Return to services
            </a>
          </p>
        </>
      )}
    </>
  );
}
