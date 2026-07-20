/**
 * Sample payloads for the "Test connection" feature in the staff webhook
 * registry.
 *
 * Each form hook (see `lib/form-hooks`) has a realistic example of the payload
 * a real submission would POST to its webhook. Staff can send one of these
 * sample payloads to a registered URL to check the connection end-to-end
 * without going through the citizen-facing form. The shapes mirror the payload
 * contracts documented in each hook's `description`.
 *
 * These are fictional demo values — every form in SimDPG operates on synthetic
 * data — so they are safe to send to a workflow while wiring it up.
 */

import { FORM_HOOKS } from "./form-hooks";

/** A JSON-serialisable sample payload keyed by form-hook key. */
export const FORM_SAMPLE_PAYLOADS: Record<string, unknown> = {
  "birth-registration": {
    mother_national_id: "NID-100200300",
    father_national_id: "NID-100200301",
    given_name: "Amara",
    family_name: "Okonkwo",
    date_of_birth: "2026-05-14",
    sex: "female",
    place_of_birth: "Central Hospital, Capital City",
  },
  "death-registration-lookup": {
    national_id: "NID-100200300",
  },
  "death-registration-preview": {
    citizen_data: {
      national_id: "NID-100200300",
      given_name: "Amara",
      family_name: "Okonkwo",
      date_of_birth: "1954-02-03",
    },
    userInput: {
      dateOfDeath: "2026-07-10",
      placeOfDeath: "Central Hospital, Capital City",
      causeOfDeath: "Natural causes",
    },
  },
  "death-registration-confirm": {
    citizen_data: {
      national_id: "NID-100200300",
      given_name: "Amara",
      family_name: "Okonkwo",
    },
    deathRegistration: {
      dateOfDeath: "2026-07-10",
      placeOfDeath: "Central Hospital, Capital City",
      causeOfDeath: "Natural causes",
    },
    enrollment_data: [
      { program_id: "PROG-PENSION", status: "active" },
    ],
    payment_data: [
      { payment_id: "PAY-55012", status: "scheduled", amount: 120.0 },
    ],
  },
  "national-id": {
    given_name: "Amara",
    family_name: "Okonkwo",
    date_of_birth: "1990-08-21",
    sex: "female",
    address_line_1: "42 Market Street",
    city: "Capital City",
    postal_code: "10001",
    email: "amara.okonkwo@example.com",
    phone_number: "+1-555-0100",
  },
  "marriage-registration": {
    spouse_1_national_id: "NID-100200300",
    spouse_2_national_id: "NID-100200302",
    date_of_marriage: "2026-06-30",
    place_of_marriage: "City Hall, Capital City",
  },
  "benefit-eligibility-lookup": {
    national_id: "NID-100200300",
  },
  "benefit-eligibility-check": {
    citizen_id: "NID-100200300",
    program_id: "PROG-PENSION",
  },
  "benefit-eligibility-enrol": {
    citizen_id: "NID-100200300",
    program_id: "PROG-PENSION",
  },
};

/**
 * Return the sample payload for a form hook as a pretty-printed JSON string,
 * ready to seed an editable textarea. Falls back to an empty object for any
 * hook without a bespoke sample so the UI always has something to show.
 */
export function getSamplePayloadJson(key: string): string {
  const payload = FORM_SAMPLE_PAYLOADS[key] ?? {};
  return JSON.stringify(payload, null, 2);
}

/** Keys that have a bespoke sample payload (used by the parity test). */
export const SAMPLE_PAYLOAD_KEYS = Object.keys(FORM_SAMPLE_PAYLOADS);

/** Every form-hook key, for exhaustiveness checks. */
export const ALL_FORM_HOOK_KEYS = FORM_HOOKS.map((h) => h.key);
