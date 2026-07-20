/**
 * Catalog of portal form-submission hooks.
 *
 * Where the systems registry describes events a backend *system* emits, this
 * is the equivalent for forms the *portal* submits. Each citizen-facing form
 * (or each step of a multi-step form) has a stable `key`. When the form is
 * submitted, the portal looks up the webhook URL registered for that key (see
 * `lib/form-webhooks`) and POSTs the submission there — so staff can point a
 * form at an OpenFn workflow from the staff area instead of editing env vars.
 *
 * This is the single source of truth for which forms are wired through the
 * central submission point. The optional `legacyEnvVar` lets an existing
 * deployment keep working: until a URL is registered for a form, the resolver
 * falls back to that environment variable.
 */

export interface FormHook {
  /** Stable key used in the submission URL and the webhook registry. */
  key: string;
  /** The service this form belongs to (matches a ServiceDefinition id). */
  serviceId: string;
  /** Human-readable name shown in the staff registry. */
  name: string;
  /** What submitting this form does / what the workflow receives. */
  description: string;
  /**
   * Environment variable consulted as a fallback when no URL is registered.
   * Present only for forms that predate the registry, to keep their existing
   * deployments working during the migration.
   */
  legacyEnvVar?: string;
}

export const FORM_HOOKS: FormHook[] = [
  {
    key: "birth-registration",
    serviceId: "birth-registration",
    name: "Birth registration",
    description:
      "Submitted when a parent registers a birth. Payload: mother_national_id, father_national_id (optional), given_name, family_name, date_of_birth, sex, place_of_birth.",
  },
  {
    key: "death-registration-lookup",
    serviceId: "death-registration",
    name: "Death registration — citizen lookup (step 1)",
    description:
      "Validates the deceased's national ID against Identity and returns their citizen record. Payload: national_id.",
  },
  {
    key: "death-registration-preview",
    serviceId: "death-registration",
    name: "Death registration — preview (step 2)",
    description:
      "Takes the looked-up citizen plus the entered death details and checks Civil Registry, Benefits enrolments, and pending payments so the portal can preview what will be closed. Payload: citizen_data, userInput (dateOfDeath, placeOfDeath, causeOfDeath).",
  },
  {
    key: "death-registration-confirm",
    serviceId: "death-registration",
    name: "Death registration — confirm (step 3)",
    description:
      "Registers the death in Civil Registry and cascades the closure across Identity and Benefits. Payload: the preview response (citizen_data, deathRegistration, enrollment_data, payment_data).",
  },
  {
    key: "national-id",
    serviceId: "digital-identity",
    name: "National ID application",
    description:
      "Submitted when a citizen applies for a national ID. Payload: given_name, family_name, date_of_birth, sex, address_line_1, city, postal_code, email, phone_number.",
    legacyEnvVar: "OPENFN_NATIONAL_ID_WEBHOOK_URL",
  },
  {
    key: "marriage-registration",
    serviceId: "marriage-registration",
    name: "Marriage registration",
    description:
      "Submitted when a marriage is registered from the portal. Payload: spouse_1_national_id, spouse_2_national_id, date_of_marriage, place_of_marriage.",
    legacyEnvVar: "OPENFN_MARRIAGE_REGISTRATION_WEBHOOK_URL",
  },
  {
    key: "benefit-eligibility-lookup",
    serviceId: "benefits-eligibility",
    name: "Benefit eligibility — citizen lookup (step 1)",
    description:
      "Validates a national ID against Identity and returns the list of active benefit programmes. Payload: national_id.",
    legacyEnvVar: "OPENFN_BENEFIT_ELIGIBILITY_PART1_URL",
  },
  {
    key: "benefit-eligibility-check",
    serviceId: "benefits-eligibility",
    name: "Benefit eligibility — eligibility check (step 2)",
    description:
      "Evaluates whether a citizen qualifies for the selected programme. Payload: citizen_id, program_id.",
    legacyEnvVar: "OPENFN_BENEFIT_ELIGIBILITY_PART2_URL",
  },
  {
    key: "benefit-eligibility-enrol",
    serviceId: "benefits-eligibility",
    name: "Benefit eligibility — enrolment (step 3)",
    description:
      "Creates the enrolment in Benefits when a citizen confirms an eligible programme. Payload: citizen_id, program_id.",
    legacyEnvVar: "OPENFN_BENEFIT_ELIGIBILITY_PART3_URL",
  },
];

/**
 * Every registered form-hook key as a literal tuple. Kept alongside
 * `FORM_HOOKS` (a test asserts the two stay in sync) so we can expose a
 * `FormHookKey` union without widening `FORM_HOOKS`' element type — which would
 * make optional fields like `legacyEnvVar` unreadable on the union.
 */
export const FORM_HOOK_KEYS = [
  "birth-registration",
  "death-registration-lookup",
  "death-registration-preview",
  "death-registration-confirm",
  "national-id",
  "marriage-registration",
  "benefit-eligibility-lookup",
  "benefit-eligibility-check",
  "benefit-eligibility-enrol",
] as const;

/**
 * Union of every registered form-hook key. Used to exhaustively type maps keyed
 * by hook (e.g. the sample-payload catalog in `lib/form-sample-payloads`).
 */
export type FormHookKey = (typeof FORM_HOOK_KEYS)[number];

const FORM_HOOKS_BY_KEY = new Map(FORM_HOOKS.map((h) => [h.key, h]));

export function getFormHook(key: string): FormHook | undefined {
  return FORM_HOOKS_BY_KEY.get(key);
}

export function isFormHookKey(key: string): key is FormHookKey {
  return FORM_HOOKS_BY_KEY.has(key);
}

/** Form hooks belonging to a given service, in catalog order. */
export function formHooksForService(serviceId: string): FormHook[] {
  return FORM_HOOKS.filter((h) => h.serviceId === serviceId);
}
