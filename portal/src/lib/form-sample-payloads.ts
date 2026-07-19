/**
 * Sample submission payloads for each portal form hook.
 *
 * These power the "Test Connection" button in the staff webhook registry: they
 * give staff a realistic, editable starting point for a test POST so they can
 * confirm a workflow is wired up correctly before any real citizen submits the
 * form. The shapes mirror the payload contracts documented in `form-hooks.ts`
 * and produced by the simulation generators (see `lib/simulations/generators`),
 * so a workflow that handles the sample handles the real thing.
 *
 * These are illustrative fixtures only — the IDs and personal details are
 * invented and are not expected to resolve against any live system.
 */

import type { FormHookKey } from "./form-hooks";

export const FORM_SAMPLE_PAYLOADS: Record<FormHookKey, unknown> = {
  "birth-registration": {
    mother_national_id: "NID-100001",
    father_national_id: "NID-100002",
    given_name: "Ada",
    family_name: "Lovelace",
    date_of_birth: "2025-01-15",
    sex: "female",
    place_of_birth: "Capital City",
  },
  "death-registration-lookup": {
    national_id: "NID-100001",
  },
  "death-registration-preview": {
    citizen_data: {
      id: "citizen-1",
      national_id: "NID-100001",
      given_name: "Ada",
      family_name: "Lovelace",
      date_of_birth: "1950-01-15",
      sex: "female",
    },
    userInput: {
      dateOfDeath: "2025-03-01",
      placeOfDeath: "Capital City",
      causeOfDeath: "Natural causes",
    },
  },
  "death-registration-confirm": {
    citizen_data: {
      id: "citizen-1",
      national_id: "NID-100001",
      given_name: "Ada",
      family_name: "Lovelace",
    },
    deathRegistration: {
      dateOfDeath: "2025-03-01",
      placeOfDeath: "Capital City",
      causeOfDeath: "Natural causes",
    },
    enrollment_data: [],
    payment_data: [],
  },
  "national-id": {
    given_name: "Ada",
    family_name: "Lovelace",
    date_of_birth: "1990-01-01",
    sex: "female",
    address_line_1: "1 Test St",
    city: "Testville",
    postal_code: "00000",
    email: "ada@example.test",
    phone_number: "+100",
  },
  "marriage-registration": {
    spouse_1_national_id: "NID-100001",
    spouse_2_national_id: "NID-100002",
    date_of_marriage: "2025-06-01",
    place_of_marriage: "Capital City",
  },
  "benefit-eligibility-lookup": {
    national_id: "NID-100001",
  },
  "benefit-eligibility-check": {
    citizen_id: "citizen-1",
    program_id: "program-1",
  },
  "benefit-eligibility-enrol": {
    citizen_id: "citizen-1",
    program_id: "program-1",
  },
};

/**
 * The sample payload for a form hook as a pretty-printed JSON string, ready to
 * drop into an editable textarea. Returns an empty object literal for unknown
 * keys so callers always get valid, editable JSON.
 */
export function getSamplePayloadJson(key: string): string {
  const payload = (FORM_SAMPLE_PAYLOADS as Record<string, unknown>)[key] ?? {};
  return JSON.stringify(payload, null, 2);
}
