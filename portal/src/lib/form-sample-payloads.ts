/**
 * Sample submission payloads for each portal form hook.
 *
 * These power the "Test connection" button in the staff webhook registry: when
 * a staff member opens the test panel for a form, we pre-fill an editable
 * textarea with a realistic example of what that form POSTs to its webhook, so
 * they can fire a one-off request and inspect the workflow's response without
 * having to hand-craft a payload.
 *
 * The shapes mirror the payload contracts documented on each hook in
 * `lib/form-hooks` — keep the two in sync. The map is keyed by `FormHookKey`
 * (a `Record`), so adding a new form hook without a sample here is a type error.
 */

import type { FormHookKey } from "./form-hooks";

export const FORM_SAMPLE_PAYLOADS: Record<FormHookKey, unknown> = {
  "birth-registration": {
    mother_national_id: "S1234567A",
    father_national_id: "S7654321B",
    given_name: "Aisha",
    family_name: "Rahman",
    date_of_birth: "2026-05-14",
    sex: "female",
    place_of_birth: "Central Hospital",
  },
  "death-registration-lookup": {
    national_id: "S1234567A",
  },
  "death-registration-preview": {
    citizen_data: {
      national_id: "S1234567A",
      given_name: "Aisha",
      family_name: "Rahman",
      date_of_birth: "1950-03-02",
      sex: "female",
    },
    userInput: {
      dateOfDeath: "2026-07-10",
      placeOfDeath: "Central Hospital",
      causeOfDeath: "Natural causes",
    },
  },
  "death-registration-confirm": {
    citizen_data: {
      national_id: "S1234567A",
      given_name: "Aisha",
      family_name: "Rahman",
    },
    deathRegistration: {
      dateOfDeath: "2026-07-10",
      placeOfDeath: "Central Hospital",
      causeOfDeath: "Natural causes",
    },
    enrollment_data: [
      { program_id: "pension", status: "active" },
    ],
    payment_data: [
      { payment_id: "pmt_001", status: "pending", amount: 250 },
    ],
  },
  "national-id": {
    given_name: "Aisha",
    family_name: "Rahman",
    date_of_birth: "1990-11-23",
    sex: "female",
    address_line_1: "12 Orchard Road",
    city: "Metropolis",
    postal_code: "049213",
    email: "aisha.rahman@example.com",
    phone_number: "+65 8123 4567",
  },
  "marriage-registration": {
    spouse_1_national_id: "S1234567A",
    spouse_2_national_id: "S7654321B",
    date_of_marriage: "2026-06-01",
    place_of_marriage: "City Hall",
  },
  "benefit-eligibility-lookup": {
    national_id: "S1234567A",
  },
  "benefit-eligibility-check": {
    citizen_id: "S1234567A",
    program_id: "childcare-subsidy",
  },
  "benefit-eligibility-enrol": {
    citizen_id: "S1234567A",
    program_id: "childcare-subsidy",
  },
};

/** The raw sample object for a hook (undefined for an unknown key). */
export function getSamplePayload(key: FormHookKey): unknown {
  return FORM_SAMPLE_PAYLOADS[key];
}

/**
 * Pretty-printed JSON sample for a hook, ready to drop into a textarea. Accepts
 * a plain `string` so UI code needn't narrow to `FormHookKey`; unknown keys get
 * an empty object so the panel still opens with valid, editable JSON.
 */
export function getSamplePayloadJson(key: string): string {
  const sample = (FORM_SAMPLE_PAYLOADS as Record<string, unknown>)[key] ?? {};
  return JSON.stringify(sample, null, 2);
}
