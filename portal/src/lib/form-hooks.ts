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
    key: "national-id",
    serviceId: "digital-identity",
    name: "National ID application",
    description:
      "Submitted when a citizen applies for a national ID. Payload: given_name, family_name, date_of_birth, sex, address_line_1, city, postal_code, email, phone_number.",
    legacyEnvVar: "OPENFN_NATIONAL_ID_WEBHOOK_URL",
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

const FORM_HOOKS_BY_KEY = new Map(FORM_HOOKS.map((h) => [h.key, h]));

export function getFormHook(key: string): FormHook | undefined {
  return FORM_HOOKS_BY_KEY.get(key);
}

export function isFormHookKey(key: string): boolean {
  return FORM_HOOKS_BY_KEY.has(key);
}

/** Form hooks belonging to a given service, in catalog order. */
export function formHooksForService(serviceId: string): FormHook[] {
  return FORM_HOOKS.filter((h) => h.serviceId === serviceId);
}
