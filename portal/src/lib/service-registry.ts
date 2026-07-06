export type BuildStatus = "built" | "stub";

export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  dciAlignment: string;
  href: string;
  showOnHomepage: boolean;
  formBuilt: boolean;
  openfnConnected: boolean;
  customerJourney: string[];
  systems: { name: string; role: string; port: number }[];
  simulationNotes: string[];
  openfnWorkflows: {
    name: string;
    trigger: string;
    description: string;
    prompt: string;
    envVar?: string;
  }[];
}

export const CATEGORIES: ServiceCategory[] = [
  {
    id: "civil-registration",
    name: "Civil registration",
    description:
      "Register life events including births, deaths, and marriages.",
  },
  {
    id: "identity",
    name: "Identity",
    description: "Apply for identity documents and manage your citizen record.",
  },
  {
    id: "health",
    name: "Health",
    description:
      "Access health services, vaccinations, and personalised health advice.",
  },
  {
    id: "social-protection",
    name: "Social protection and payments",
    description:
      "Apply for benefits, check eligibility, and manage government payments.",
  },
  {
    id: "your-record",
    name: "Your record",
    description: "View your personal record and government notifications.",
  },
];

export const SERVICES: ServiceDefinition[] = [
  // ── Civil Registration ──────────────────────────────────────────────
  {
    id: "birth-registration",
    name: "Register a birth",
    description:
      "Register the birth of a child and receive a birth certificate reference.",
    categoryId: "civil-registration",
    dciAlignment: "CRVS — Birth Registration",
    href: "/services/birth-registration",
    showOnHomepage: true,
    formBuilt: true,
    openfnConnected: true,
    customerJourney: [
      "Parent or authorised person visits the portal and selects 'Register a birth'.",
      "Enters the mother's national ID (looked up from Identity system).",
      "Optionally enters the father's national ID.",
      "Enters the child's details: given name, family name, date of birth, sex, place of birth.",
      "Reviews the details and submits the registration.",
      "Receives a submission reference number on a confirmation page.",
    ],
    systems: [
      {
        name: "Civil Registry",
        role: "Primary. Stores the birth record with parent references, date, and place of birth.",
        port: 3002,
      },
      {
        name: "Identity",
        role: "Creates a new citizen record for the child (assigned a SIM-XXXXXX national ID). Updates household membership.",
        port: 3001,
      },
      {
        name: "Health",
        role: "Registers the newborn as a patient.",
        port: 3003,
      },
      {
        name: "Benefits",
        role: "Checks child benefit eligibility and auto-enrols the child if eligible.",
        port: 3004,
      },
      {
        name: "Notifications",
        role: "Emails the mother confirmations of the patient registration and any benefit enrolment.",
        port: 3005,
      },
    ],
    simulationNotes: [
      "The birth.ts simulation script directly orchestrates all systems: creates the citizen in Identity, registers them as a patient in Health, and registers the birth in Civil Registry. Rate: ~15 births per 1,000 population per year.",
    ],
    openfnWorkflows: [
      {
        name: "Register a birth 1 — Create citizen & register birth",
        trigger: "Webhook: portal form",
        description:
          "Receives the portal form submission, looks up the mother in Identity, creates a citizen record for the newborn in the mother's household, and registers the birth in Civil Registry.",
        prompt: `Build an OpenFn workflow that processes birth registrations submitted from the SimDPG portal.

Trigger: Webhook — the portal form POSTs: mother_national_id, father_national_id (optional), given_name, family_name, date_of_birth, sex, place_of_birth.

Steps:
1. Look up the mother in Identity (GET http://localhost:3001/citizens?national_id={mother_national_id}) and fetch her household (GET http://localhost:3001/citizens/{id}/household). Fail with a clear error if she is not found.
2. Create a citizen record for the newborn in Identity (POST http://localhost:3001/citizens) with { given_name, family_name, date_of_birth, sex, household_id: mother's household, relationship: "child" }.
3. If father_national_id was provided, look up the father's citizen ID in Identity.
4. Register the birth in Civil Registry (POST http://localhost:3002/births) with { child_citizen_id, mother_citizen_id, father_citizen_id (or null), date_of_birth, place_of_birth }.

The birth.registered event emitted by Civil Registry then fans out to the downstream workflows.`,
      },
      {
        name: "Register a birth 2 — Register patient & notify mother",
        trigger: "Webhook: birth.registered (child under 1)",
        description:
          "When a birth is registered in Civil Registry, register the newborn as a patient in the Health system and email the mother a confirmation. Skips children aged 1 or older.",
        prompt: `Build an OpenFn workflow that registers a newborn as a Health patient when a birth is registered in SimDPG.

Trigger: Webhook event \`birth.registered\` from Civil Registry (http://localhost:3002). The event envelope's \`data\` contains: child_citizen_id, mother_citizen_id, father_citizen_id (optional), date_of_birth, place_of_birth, registration_date, id.

Steps:
1. Validate the child is under 1 year old from date_of_birth; otherwise skip the rest of the workflow peacefully.
2. Register the child as a patient in Health (POST http://localhost:3003/patients) with { citizen_id: child_citizen_id }.
3. Look up the mother's email from Identity (GET http://localhost:3001/citizens/{mother_citizen_id}), logging rather than failing when it is missing.
4. Send the mother a notification confirming the patient registration (POST http://localhost:3005/notifications) with channel "email".`,
      },
      {
        name: "Register a birth 3 — Child Benefit auto-enrolment",
        trigger: "Webhook: birth.registered",
        description:
          "When a birth is registered, check the child's eligibility for the Child Benefit programme (50/month for children under 5), auto-enrol if eligible, and email the mother an enrolment confirmation.",
        prompt: `Build an OpenFn workflow that auto-enrols a newborn in Child Benefit when a birth is registered in SimDPG.

Trigger: Webhook event \`birth.registered\` from Civil Registry (http://localhost:3002). The event envelope's \`data\` contains: child_citizen_id, mother_citizen_id, date_of_birth.

Steps:
1. Check Child Benefit eligibility for the child (POST http://localhost:3004/eligibility/check) with { citizen_id: child_citizen_id, program_id: <Child Benefit programme id> } — Child Benefit pays 50/month for children under 5.
2. If eligible, auto-enrol the child (POST http://localhost:3004/enrollments).
3. Look up the mother's email from Identity (GET http://localhost:3001/citizens/{mother_citizen_id}), logging rather than failing when it is missing.
4. Send the mother an enrolment confirmation notification (POST http://localhost:3005/notifications) with channel "email".

If a lookup or notification step fails, log the error and continue.`,
      },
    ],
  },
  {
    id: "death-registration",
    name: "Register a death",
    description: "Register a death and obtain a death certificate reference.",
    categoryId: "civil-registration",
    dciAlignment: "CRVS — Death Registration",
    href: "/services/death-registration",
    showOnHomepage: true,
    formBuilt: true,
    openfnConnected: true,
    customerJourney: [
      "Family member or authorised person visits the portal and selects 'Register a death'.",
      "Enters the deceased citizen's national ID to look up their record.",
      "Confirms the citizen's identity from the returned details.",
      "Enters the date, place, and cause of death.",
      "Reviews the details and submits the registration.",
      "Receives a death certificate reference number on a confirmation page.",
    ],
    systems: [
      {
        name: "Civil Registry",
        role: "Primary. Stores the death record with date, place, and cause of death.",
        port: 3002,
      },
      {
        name: "Identity",
        role: "Updates the citizen's status to 'deceased' and records date of death.",
        port: 3001,
      },
      {
        name: "Health",
        role: "Marks the patient record as inactive. Cancels outstanding vaccination schedules.",
        port: 3003,
      },
      {
        name: "Benefits",
        role: "Terminates all active enrolments. Cancels pending payments.",
        port: 3004,
      },
    ],
    simulationNotes: [
      "The death.ts simulation script updates the citizen status in Identity and registers the death in Civil Registry. Deaths are weighted by age (higher probability for elderly). Rate: ~8 deaths per 1,000 population per year.",
    ],
    openfnWorkflows: [
      {
        name: "Register a death 1 — Look up citizen",
        trigger: "Webhook: portal form",
        description:
          "Receives the portal lookup submission and validates the deceased's national ID against Identity, returning their citizen record so the portal can confirm the identity.",
        prompt: "",
      },
      {
        name: "Register a death 2 — Preview closures",
        trigger: "Webhook: portal form",
        description:
          "Takes the confirmed citizen and entered death details, checks Civil Registry for an existing death record, and gathers active Benefits enrolments and pending payments so the portal can preview what will be closed.",
        prompt: "",
      },
      {
        name: "Register a death 3 — Register death & cascade closure",
        trigger: "Webhook: portal form",
        description:
          "Registers the death in Civil Registry, patches the citizen's Identity status to 'deceased', and terminates active enrolments and pending payments in Benefits.",
        prompt: "",
      },
      {
        name: "Death registered → Close records across systems",
        trigger: "Webhook: death.registered",
        description:
          "When a death is registered, cascade the closure: update citizen status to 'deceased' in Identity, terminate all active benefit enrolments, and mark the patient inactive in Health.",
        prompt: `Build an OpenFn workflow that cascades a death registration across all SimDPG systems.

Trigger: Webhook event \`death.registered\` from Civil Registry (http://localhost:3002).

Payload: citizen_id, date_of_death, place_of_death, cause_of_death, registration_date.

Steps:
1. Update citizen status to "deceased" in Identity (PATCH http://localhost:3001/citizens/{citizen_id}) with { status: "deceased", date_of_death }.
2. Look up the patient by citizen_id in Health (GET http://localhost:3003/patients?citizen_id={citizen_id}). Mark patient inactive.
3. Cancel any outstanding vaccination schedules for the deceased patient.
4. Look up active enrolments in Benefits (GET http://localhost:3004/enrollments?citizen_id={citizen_id}&status=active). For each, PATCH status to "terminated" with termination reason "deceased".
5. Cancel any pending scheduled payments for the citizen in Benefits.
6. Look up household members from Identity (GET http://localhost:3001/citizens/{citizen_id}/household) to find surviving family. Send a death registration confirmation notification to next of kin via Notifications (POST http://localhost:3005/notifications).

All steps should execute even if one fails — the death record in Civil Registry is the source of truth.`,
      },
    ],
  },
  {
    id: "marriage-registration",
    name: "Register a marriage",
    description: "Register a marriage between two citizens.",
    categoryId: "civil-registration",
    dciAlignment: "CRVS — Marriage Registration",
    href: "/services/marriage-registration",
    showOnHomepage: true,
    formBuilt: true,
    openfnConnected: true,
    customerJourney: [
      "Couple or authorised registrar visits the portal and selects 'Register a marriage'.",
      "Enters the first spouse's national ID and confirms their identity.",
      "Enters the second spouse's national ID and confirms their identity.",
      "Enters the date and place of marriage.",
      "Reviews the details and submits the registration.",
      "Receives a marriage certificate reference number on a confirmation page.",
    ],
    systems: [
      {
        name: "Civil Registry",
        role: "Primary. Stores the marriage record linking both spouse citizen IDs with date and place.",
        port: 3002,
      },
      {
        name: "Identity",
        role: "Links or merges the two households. Updates household membership records.",
        port: 3001,
      },
      {
        name: "Benefits",
        role: "Re-assesses benefit eligibility for both spouses based on combined household status.",
        port: 3004,
      },
    ],
    simulationNotes: [
      "The marriage.ts simulation script pairs unmarried adults (18+) and registers marriages in Civil Registry. Rate: ~7 marriages per 1,000 population per year.",
    ],
    openfnWorkflows: [
      {
        name: "Marriage registration — Link households & reassess benefits",
        trigger: "Webhook: portal form",
        description:
          "Runs synchronous pre-registration checks (identity lookup, household reconciliation, benefits eligibility reassessment) and registers the marriage in Civil Registry.",
        prompt: `Build an OpenFn workflow that processes marriage registrations in SimDPG.

Trigger: Webhook from portal form submission.

Payload: spouse_1_national_id, spouse_2_national_id, date_of_marriage, place_of_marriage.

Steps:
1. Look up both spouses by national ID from Identity (GET http://localhost:3001/citizens?national_id={id}).
2. Check each spouse's household (GET http://localhost:3001/citizens/{id}/household). If one has a household and the other does not, add the other as spouse (PATCH http://localhost:3001/households/{id}/members). If both have different households, merge household 2 into household 1.
3. Re-assess benefit eligibility for both spouses across active programmes (POST http://localhost:3004/eligibility/check).
4. Register the marriage in Civil Registry (POST http://localhost:3002/marriages).
5. Return the marriage certificate reference number in the workflow response.`,
      },
      {
        name: "Marriage registered event — notify spouses",
        trigger: "Webhook: marriage.registered",
        description:
          "After Civil Registry registration succeeds, look up spouse contact details and send confirmation notifications to both spouses.",
        prompt: `Build an OpenFn workflow triggered by marriage.registered in SimDPG.

Trigger: Webhook event \`marriage.registered\` from Civil Registry (http://localhost:3002).

Payload: spouse_1_citizen_id, spouse_2_citizen_id, date_of_marriage, place_of_marriage, id.

Steps:
1. Look up both spouses from Identity by citizen ID.
2. Send notifications to both spouses including marriage date, place, certificate number, and both spouse names.
3. Do not write back to Civil Registry in this workflow.`,
      },
    ],
  },

  // ── Identity ────────────────────────────────────────────────────────
  {
    id: "digital-identity",
    name: "Apply for a national ID",
    description: "Apply for a national ID card or digital identity credential.",
    categoryId: "identity",
    dciAlignment: "Foundational ID — Identity Issuance",
    href: "/services/digital-identity",
    showOnHomepage: true,
    formBuilt: true,
    openfnConnected: true,
    customerJourney: [
      "Citizen visits the portal and selects 'Apply for a national ID'.",
      "Enters their personal details: given name, family name, date of birth, sex.",
      "Provides a residential address (line 1, city, postal code).",
      "System checks for existing citizen records to prevent duplicates.",
      "If no duplicate found, creates a citizen record in the Identity system.",
      "Citizen receives their assigned national ID (SIM-XXXXXX format) on a confirmation page.",
      "A notification is sent confirming the ID issuance.",
    ],
    systems: [
      {
        name: "Identity",
        role: "Primary. Creates the citizen record, assigns the national ID, stores the residential address.",
        port: 3001,
      },
      {
        name: "Notifications",
        role: "Sends confirmation of ID issuance to the citizen's email or phone.",
        port: 3005,
      },
    ],
    simulationNotes: [
      "Citizens are created by the population generator (simulation/generate.ts) which calls Identity directly. The digital identity service would be the citizen-facing equivalent.",
    ],
    openfnWorkflows: [
      {
        name: "ID application → Deduplicate & create citizen",
        trigger: "Form submission from portal",
        description:
          "When a citizen applies for a national ID, check for duplicates in Identity, create the citizen record if new, and send a confirmation notification.",
        prompt: `Build an OpenFn workflow that processes national ID applications in SimDPG.

Trigger: Form submission from the portal containing: given_name, family_name, date_of_birth, sex, address_line_1, city, postal_code.

Steps:
1. Search for potential duplicates in Identity (GET http://localhost:3001/citizens/search?name={given_name}+{family_name}&dob={date_of_birth}).
2. If a matching citizen record exists (same name + DOB + sex), return the existing national_id rather than creating a duplicate. Notify the applicant that they already have an ID.
3. If no match, create a new citizen in Identity (POST http://localhost:3001/citizens) with { given_name, family_name, date_of_birth, sex, addresses: [{ type: "residential", line_1, city, postal_code, from_date: today }] }.
4. The response includes the assigned national_id (SIM-XXXXXX format).
5. Send a confirmation notification (POST http://localhost:3005/notifications) with the new national ID to the citizen's provided contact details.

Error handling: If Identity is unavailable, queue the application for retry. Duplicate detection should use fuzzy matching — flag near-matches for manual review rather than silently creating duplicates.`,
      },
    ],
  },

  // ── Health ──────────────────────────────────────────────────────────
  {
    id: "vaccination",
    name: "Book a vaccination",
    description: "Record a vaccination for a registered patient.",
    categoryId: "health",
    dciAlignment: "Health — Immunization Registry",
    href: "/services/vaccination",
    showOnHomepage: true,
    formBuilt: false,
    openfnConnected: false,
    customerJourney: [
      "Patient or parent visits the portal and selects 'Book a vaccination'.",
      "Enters the citizen's national ID to look up their patient record.",
      "Confirms the patient's identity from the returned details.",
      "Selects the vaccine and dose number from those due on the schedule.",
      "The provider administers the vaccine and records the batch number.",
      "The system records the encounter and vaccination, calculates the next dose due date.",
      "Patient receives confirmation with vaccination details and next appointment date.",
    ],
    systems: [
      {
        name: "Health",
        role: "Primary. Stores vaccination records (vaccine name, dose, batch number, dates) and encounter records. Provides overdue vaccination queries.",
        port: 3003,
      },
      {
        name: "Identity",
        role: "Citizen lookup for patient identification.",
        port: 3001,
      },
    ],
    simulationNotes: [
      "The vaccination.ts simulation script follows the standard child vaccine schedule (BCG at birth; OPV at 6 and 12 months; DPT at 2, 4, 6 months; Measles at 9 months and 5 years) and administers annual flu vaccines to citizens aged 65+.",
    ],
    openfnWorkflows: [
      {
        name: "Vaccination administered → Confirm & schedule next",
        trigger: "Webhook: vaccination.administered",
        description:
          "When a vaccination is recorded, send a confirmation notification and ensure the next dose is scheduled.",
        prompt: `Build an OpenFn workflow that confirms a vaccination and ensures the next dose is scheduled in SimDPG.

Trigger: Webhook event \`vaccination.administered\` from Health (http://localhost:3003).
Payload: patient_id, citizen_id, vaccine_name, dose_number, administered_date, next_dose_due, batch_number.

Steps:
1. Fetch patient details from Health (GET http://localhost:3003/patients/{patient_id}).
2. Look up citizen contact details from Identity (GET http://localhost:3001/citizens/{citizen_id}).
3. Send a vaccination confirmation notification (POST http://localhost:3005/notifications) with vaccine name, dose number, and next appointment date if applicable.
4. If next_dose_due is set but no follow-up appointment exists, ensure the next dose is scheduled in Health.`,
      },
      {
        name: "Weekly missed vaccination follow-up",
        trigger: "Scheduled: weekly cron",
        description:
          "Query Health for overdue vaccinations and send reminder notifications to patients.",
        prompt: `Build an OpenFn workflow that follows up on overdue vaccinations in SimDPG.

Trigger: Scheduled cron, runs weekly.

Steps:
1. Query Health for overdue vaccinations (GET http://localhost:3003/vaccinations/overdue?as_of={today}).
2. For each overdue patient, look up citizen contact info from Identity (GET http://localhost:3001/citizens/{citizen_id}).
3. Send reminder notifications via Notifications (POST http://localhost:3005/notifications) for each overdue vaccination, including vaccine name and how overdue it is.`,
      },
    ],
  },
  {
    id: "health-guidance",
    name: "Health guidance",
    description:
      "Navigate government health services and find the right care pathway.",
    categoryId: "health",
    dciAlignment: "Health — Service Navigation",
    href: "/services/health-guidance",
    showOnHomepage: true,
    formBuilt: false,
    openfnConnected: false,
    customerJourney: [
      "Citizen visits the portal and selects 'Health guidance'.",
      "Enters their national ID to look up their record.",
      "System retrieves their patient record including vaccination history and recent encounters.",
      "Citizen sees a summary of their health status: upcoming vaccinations, recent visits, and recommended next steps.",
      "System provides guidance on available health services and next actions based on their profile.",
    ],
    systems: [
      {
        name: "Health",
        role: "Primary. Provides patient records, encounter history, vaccination status, and overdue vaccination queries.",
        port: 3003,
      },
      {
        name: "Identity",
        role: "Citizen lookup for patient identification and demographics (age, sex).",
        port: 3001,
      },
    ],
    simulationNotes: [
      "No dedicated simulation script. Health guidance aggregates existing data from the Health system generated by other simulation scripts (clinic visits, vaccinations).",
    ],
    openfnWorkflows: [
      {
        name: "Citizen lookup → Compile health guidance",
        trigger: "On-demand: portal request",
        description:
          "When a citizen requests health guidance, aggregate their health data and compile recommended actions.",
        prompt: `Build an OpenFn workflow that aggregates a citizen's health data and provides guidance on available services.

Trigger: On-demand request from the portal with the citizen's national_id.

Steps:
1. Look up citizen in Identity (GET http://localhost:3001/citizens?national_id={national_id}) to get citizen_id, date_of_birth, and sex.
2. Look up patient record in Health (GET http://localhost:3003/patients?citizen_id={citizen_id}).
3. Fetch the patient's vaccination history and check for overdue vaccinations (GET http://localhost:3003/vaccinations/overdue?as_of={today}).
4. Fetch recent encounters from Health (encounters for this patient).
5. Based on age and vaccination status, compile recommended actions:
   - Children under 5: list any overdue vaccinations from the standard schedule (BCG, OPV, DPT, Measles).
   - Adults 65+: check for annual flu vaccine.
   - All ages: recommend a check-up if no encounter in the last 12 months.
6. Return the compiled guidance to the portal for display.`,
      },
    ],
  },
  {
    id: "health-advice",
    name: "Personalised health advice",
    description:
      "Get personalised health recommendations based on your risk profile.",
    categoryId: "health",
    dciAlignment: "Health — Risk Assessment",
    href: "/services/health-advice",
    showOnHomepage: true,
    formBuilt: false,
    openfnConnected: false,
    customerJourney: [
      "Citizen visits the portal and selects 'Personalised health advice'.",
      "Enters their national ID.",
      "Answers a short health questionnaire: age group, existing conditions, lifestyle factors.",
      "System evaluates their profile against health guidelines and their existing records.",
      "Citizen receives personalised recommendations: overdue vaccinations, suggested check-ups, and relevant health programmes.",
    ],
    systems: [
      {
        name: "Health",
        role: "Primary. Provides vaccination history, encounter records, and patient profile for risk assessment.",
        port: 3003,
      },
      {
        name: "Identity",
        role: "Citizen details (age, sex) for demographic-based recommendations.",
        port: 3001,
      },
    ],
    simulationNotes: [
      "No dedicated simulation script. Health advice draws on existing Health system data.",
    ],
    openfnWorkflows: [
      {
        name: "Questionnaire submitted → Generate recommendations",
        trigger: "Form submission from portal",
        description:
          "When a citizen completes the health questionnaire, cross-reference their answers with their existing health data to produce personalised recommendations.",
        prompt: `Build an OpenFn workflow that generates personalised health recommendations based on a citizen's profile and questionnaire responses.

Trigger: Form submission from the portal containing: national_id, existing_conditions (array), lifestyle_factors (array).

Steps:
1. Look up citizen in Identity (GET http://localhost:3001/citizens?national_id={national_id}) to get citizen_id, date_of_birth, sex.
2. Look up patient record in Health (GET http://localhost:3003/patients?citizen_id={citizen_id}).
3. Fetch vaccination history — identify overdue or missed vaccinations based on the standard schedule and the citizen's age.
4. Fetch recent encounters from Health — note last check-up date and any recorded diagnoses.
5. Cross-reference age, sex, existing conditions, and encounter history against health guidelines to generate recommendations:
   - Priority vaccinations (overdue doses).
   - Suggested check-ups (e.g. annual physical if none in 12 months, specialist referral for reported conditions).
   - Age-specific screenings.
6. Send the recommendations as a notification (POST http://localhost:3005/notifications) and return them to the portal for display.`,
      },
    ],
  },

  // ── Social Protection ───────────────────────────────────────────────
  {
    id: "benefits-eligibility",
    name: "Check benefit eligibility",
    description:
      "Check which benefits or social programmes you are eligible for and apply.",
    categoryId: "social-protection",
    dciAlignment: "Social Protection — Eligibility & Enrolment",
    href: "/services/benefits-eligibility",
    showOnHomepage: true,
    formBuilt: true,
    openfnConnected: true,
    customerJourney: [
      "Citizen visits the portal and selects 'Check benefit eligibility'.",
      "Enters their national ID to look up their citizen record.",
      "Views the list of available programmes with descriptions.",
      "Selects a programme to check eligibility.",
      "System evaluates eligibility rules (age, household composition, qualifying events).",
      "If eligible, citizen confirms enrolment.",
      "System creates the enrolment and schedules payments (monthly or one-time).",
      "Citizen receives confirmation with enrolment reference and payment schedule.",
    ],
    systems: [
      {
        name: "Benefits",
        role: "Primary. Manages programmes, eligibility rules, enrolments, and payment scheduling.",
        port: 3004,
      },
      {
        name: "Identity",
        role: "Citizen lookup for identity verification and age calculation. Provides household information for household-based eligibility.",
        port: 3001,
      },
    ],
    simulationNotes: [
      "The benefit-claim.ts simulation script ensures three programmes exist (Child Benefit: 50/month for children under 5; Senior Pension: 200/month for citizens 65+; Maternity Grant: 500 one-time for mothers). Checks eligibility and enrols qualifying citizens.",
    ],
    openfnWorkflows: [
      {
        name: "Check benefit eligibility (Part 1)",
        trigger: "Webhook: portal form",
        description:
          "Validates a citizen's national ID against Identity and returns the list of active benefit programmes.",
        prompt: "",
        envVar: "OPENFN_BENEFIT_ELIGIBILITY_PART1_URL",
      },
      {
        name: "Check benefit eligibility (Part 2)",
        trigger: "Webhook: portal form",
        description:
          "Fetches programme and citizen details, then evaluates eligibility rules to determine whether the citizen qualifies.",
        prompt: "",
        envVar: "OPENFN_BENEFIT_ELIGIBILITY_PART2_URL",
      },
      {
        name: "Check benefit eligibility (Part 3)",
        trigger: "Webhook: portal form",
        description:
          "Creates the enrolment in Benefits when a citizen confirms they want to join an eligible programme.",
        prompt: "",
        envVar: "OPENFN_BENEFIT_ELIGIBILITY_PART3_URL",
      },
      {
        name: "Enrolment created → Schedule payments",
        trigger: "Webhook: enrollment.created",
        description:
          "When a citizen is enrolled, schedule payments based on programme rules: monthly for recurring programmes, single for one-time grants.",
        prompt: `Build an OpenFn workflow that schedules payments when a benefit enrolment is created in SimDPG.

Trigger: Webhook event \`enrollment.created\` from Benefits (http://localhost:3004).
Payload: citizen_id, program_id, enrollment_id, status, enrollment_date.

Steps:
1. Look up programme details (GET http://localhost:3004/programs/{program_id}) to get payment_amount and frequency.
2. Schedule payments (POST http://localhost:3004/payments/schedule) based on programme rules:
   - Child Benefit: 50/month, recurring.
   - Senior Pension: 200/month, recurring.
   - Maternity Grant: 500, one-time.
3. Look up citizen contact from Identity (GET http://localhost:3001/citizens/{citizen_id}).
4. Send an enrolment confirmation notification (POST http://localhost:3005/notifications) with programme name, payment schedule, and expected first payment date.`,
      },
      {
        name: "Daily age-based eligibility changes",
        trigger: "Scheduled: daily cron",
        description:
          "Check for citizens whose age triggers eligibility changes. Children turning 5 lose Child Benefit; citizens turning 65 gain Senior Pension.",
        prompt: `Build an OpenFn workflow that applies age-based benefit eligibility changes in SimDPG.

Trigger: Scheduled cron, runs daily.

Steps:
1. Query Identity for citizens with age-boundary birthdays (turning 5, 18, or 65 relative to today).
2. For children turning 5: look up active Child Benefit enrolment (GET http://localhost:3004/enrollments?citizen_id={id}&status=active), PATCH to "terminated".
3. For citizens turning 65: check Senior Pension eligibility (POST http://localhost:3004/eligibility/check), auto-enrol if eligible.
4. Send notifications for any changes (POST http://localhost:3005/notifications).`,
      },
    ],
  },
  {
    id: "survivor-benefits",
    name: "Survivor benefits",
    description:
      "Apply for a survivor's benefit or pension transfer after the death of a family member.",
    categoryId: "social-protection",
    dciAlignment: "Social Protection — Survivor Benefits",
    href: "/services/survivor-benefits",
    showOnHomepage: true,
    formBuilt: false,
    openfnConnected: false,
    customerJourney: [
      "Citizen visits the portal and selects 'Survivor benefits'.",
      "Enters their own national ID to identify themselves.",
      "Enters the deceased family member's national ID.",
      "System verifies the death is registered in Civil Registry.",
      "System checks the household relationship via the Identity system.",
      "System evaluates survivor benefit eligibility (pension transfer for surviving spouse, orphan benefit for dependent children).",
      "If eligible, citizen is enrolled and payments are scheduled.",
      "Citizen receives confirmation with enrolment details and payment schedule.",
    ],
    systems: [
      {
        name: "Benefits",
        role: "Primary. Evaluates survivor eligibility rules, creates enrolments, and schedules payments.",
        port: 3004,
      },
      {
        name: "Civil Registry",
        role: "Verifies that the death of the family member is officially registered.",
        port: 3002,
      },
      {
        name: "Identity",
        role: "Verifies the household relationship between applicant and deceased. Provides citizen details.",
        port: 3001,
      },
      {
        name: "Payments",
        role: "Disburses survivor benefit payments to the applicant's account.",
        port: 3006,
      },
      {
        name: "Notifications",
        role: "Sends confirmation of survivor benefit enrolment and payment schedule.",
        port: 3005,
      },
    ],
    simulationNotes: [
      "No dedicated simulation script yet. Survivor benefits would be triggered by the death simulation script as a follow-on workflow.",
    ],
    openfnWorkflows: [
      {
        name: "Survivor application → Verify death & assess eligibility",
        trigger: "Form submission from portal",
        description:
          "When a citizen applies for survivor benefits, verify the death record, check the household relationship, assess eligibility, and enrol if qualified.",
        prompt: `Build an OpenFn workflow that processes survivor benefit applications in SimDPG.

Trigger: Form submission from the portal containing: applicant_national_id, deceased_national_id.

Steps:
1. Look up the applicant in Identity (GET http://localhost:3001/citizens?national_id={applicant_national_id}).
2. Look up the deceased in Identity (GET http://localhost:3001/citizens?national_id={deceased_national_id}). Confirm status is "deceased".
3. Verify the death is registered in Civil Registry (GET http://localhost:3002/deaths?citizen_id={deceased_citizen_id}). If no death record, reject the application.
4. Check the household relationship (GET http://localhost:3001/citizens/{applicant_id}/household and GET http://localhost:3001/citizens/{deceased_id}/household). Confirm the applicant is a household member of the deceased (spouse, child, or other dependent).
5. Look up the deceased's benefit enrolments (GET http://localhost:3004/enrollments?citizen_id={deceased_citizen_id}) to determine transferable benefits.
6. Evaluate survivor eligibility:
   - Surviving spouse: qualifies for pension transfer (continue the deceased's Senior Pension at the same rate).
   - Dependent children under 18: qualify for orphan benefit (100/month until age 18).
7. If eligible, create new enrolment in Benefits (POST http://localhost:3004/enrollments) for the appropriate survivor programme.
8. Schedule payments (POST http://localhost:3004/payments/schedule).
9. Send confirmation notification (POST http://localhost:3005/notifications) to the applicant with enrolment details.`,
      },
    ],
  },
  {
    id: "government-payments",
    name: "Government payments",
    description:
      "View your government payment status and receive benefit disbursements.",
    categoryId: "social-protection",
    dciAlignment: "Digital Payments — Government-to-Person (G2P)",
    href: "/services/government-payments",
    showOnHomepage: true,
    formBuilt: false,
    openfnConnected: false,
    customerJourney: [
      "Citizen visits the portal and selects 'Government payments'.",
      "Enters their national ID.",
      "System looks up their active benefit enrolments and payment history.",
      "Citizen sees a summary: active programmes, scheduled payments, completed payments, and any failed payments.",
      "For pending payments, the system shows the expected amount and date.",
      "Citizen can view detailed payment history with transaction references.",
    ],
    systems: [
      {
        name: "Payments",
        role: "Primary. Maintains the payment ledger with accounts for the treasury and each citizen. Processes payment transactions.",
        port: 3006,
      },
      {
        name: "Benefits",
        role: "Provides enrolment and payment schedule data. Source of scheduled payment amounts and dates.",
        port: 3004,
      },
      {
        name: "Identity",
        role: "Citizen lookup and identity verification.",
        port: 3001,
      },
    ],
    simulationNotes: [
      "No dedicated simulation script yet. Payment disbursement would be triggered by the Benefits system's payment schedules.",
    ],
    openfnWorkflows: [
      {
        name: "Scheduled payment due → Disburse via Payments",
        trigger: "Scheduled: daily cron",
        description:
          "Process due payments by transferring funds from the treasury account to citizen accounts in the Payments system, handling failure modes gracefully.",
        prompt: `Build an OpenFn workflow for disbursing government benefit payments in SimDPG.

Trigger: Scheduled cron, runs daily.

Steps:
1. Query Benefits for payments due today (GET http://localhost:3004/payments?status=scheduled&due_date={today}).
2. For each due payment:
   a. Look up the citizen's account in Payments (GET http://localhost:3006/accounts?citizen_id={citizen_id}). If no account, create one (POST http://localhost:3006/accounts).
   b. Process the payment (POST http://localhost:3006/payments) with { from_account: "treasury", to_account: citizen_account_id, amount, reference: enrollment_id, idempotency_key }.
   c. Handle failure modes:
      - INSUFFICIENT_FUNDS: flag for treasury top-up, retry next day.
      - ACCOUNT_NOT_FOUND: create account and retry immediately.
      - GATEWAY_TIMEOUT: retry with exponential backoff (2s, 4s, 8s).
      - DUPLICATE_TRANSACTION: skip (already processed).
      - SERVICE_UNAVAILABLE: retry later.
   d. Update payment status in Benefits based on result (mark as "completed" or "failed").
3. Send payment confirmation notifications to citizens for successful payments (POST http://localhost:3005/notifications).
4. For failed payments, send failure notifications explaining the issue and expected retry date.`,
      },
    ],
  },

  // ── Your Record ─────────────────────────────────────────────────────
  {
    id: "check-my-record",
    name: "Check my record",
    description: "View your personal record across all government services.",
    categoryId: "your-record",
    dciAlignment: "Cross-cutting — Citizen Record Aggregation",
    href: "/services/check-my-record",
    showOnHomepage: true,
    formBuilt: false,
    openfnConnected: false,
    customerJourney: [
      "Citizen visits the portal and selects 'Check my record'.",
      "Enters their national ID.",
      "System looks up the citizen across all systems.",
      "Citizen sees a unified view: personal details from Identity, vital events from Civil Registry, health encounters and vaccinations from Health, benefit enrolments from Benefits, and notification history.",
      "All events are displayed on a chronological timeline with colour-coded system tags.",
    ],
    systems: [
      {
        name: "Identity",
        role: "Citizen details: name, national ID, date of birth, sex, status, addresses, household.",
        port: 3001,
      },
      {
        name: "Civil Registry",
        role: "Vital events: births, deaths, marriages linked to the citizen.",
        port: 3002,
      },
      {
        name: "Health",
        role: "Patient record, encounters, and vaccination history.",
        port: 3003,
      },
      {
        name: "Benefits",
        role: "Active and past programme enrolments, payment history.",
        port: 3004,
      },
      {
        name: "Notifications",
        role: "Notification history: all messages sent to the citizen.",
        port: 3005,
      },
    ],
    simulationNotes: [
      "No dedicated simulation script. This is a read-only aggregation view populated by all other system events during simulation runs.",
    ],
    openfnWorkflows: [
      {
        name: "Duplicate citizen detection",
        trigger: "Scheduled: periodic cron",
        description:
          "Periodically scan Identity for potential duplicate citizen records using fuzzy matching on name, date of birth, and sex.",
        prompt: `Build an OpenFn workflow for duplicate citizen detection in SimDPG.

Trigger: Scheduled cron, runs weekly.

Steps:
1. Fetch all citizens from Identity (GET http://localhost:3001/citizens) or query for recently created citizens.
2. For each citizen, search for potential duplicates using fuzzy matching (GET http://localhost:3001/citizens/search?name={name}&dob={dob}).
3. Score matches based on: exact name match (high), similar name + same DOB (high), same DOB + same sex + similar name (medium).
4. For high-confidence matches (likely duplicates), flag for review or auto-merge:
   a. Determine which record is the "primary" (older created_at date).
   b. Update all references in Civil Registry, Health, and Benefits to point to the primary citizen_id.
   c. Mark the duplicate record as merged.
5. For medium-confidence matches, create a review notification for staff.`,
      },
    ],
  },
  {
    id: "notifications",
    name: "My notifications",
    description: "View messages sent to you by government services.",
    categoryId: "your-record",
    dciAlignment: "Cross-cutting — Citizen Notifications",
    href: "/services/notifications",
    showOnHomepage: true,
    formBuilt: false,
    openfnConnected: false,
    customerJourney: [
      "Citizen visits the portal and selects 'My notifications'.",
      "Enters their national ID.",
      "System retrieves all notifications sent to the citizen from the Notifications system.",
      "Citizen sees a list of messages with date, channel (email/SMS), subject, and delivery status.",
      "Can view the full body of each notification.",
    ],
    systems: [
      {
        name: "Notifications",
        role: "Primary. Stores notification records with channel, destination, subject, body, source system, delivery status, and timestamps.",
        port: 3005,
      },
      {
        name: "Identity",
        role: "Provides citizen contact information (email, phone_number) for notification delivery.",
        port: 3001,
      },
    ],
    simulationNotes: [
      "No dedicated simulation script. Notifications are created by OpenFn workflows in response to events from other systems.",
    ],
    openfnWorkflows: [
      {
        name: "System event → Send citizen notification",
        trigger:
          "Webhook: any system event (birth.registered, enrollment.created, vaccination.administered, etc.)",
        description:
          "When a system event occurs, look up the citizen's contact details from Identity and send a notification.",
        prompt: `Build an OpenFn workflow that sends citizen notifications for any government service event in SimDPG.

Trigger: Webhook from any system event — birth.registered, death.registered, marriage.registered, enrollment.created, vaccination.administered, encounter.completed, citizen.created, citizen.updated.

Steps:
1. Parse the incoming webhook payload to determine event type and extract citizen_id.
2. Look up citizen contact information from Identity (GET http://localhost:3001/citizens/{citizen_id}) — get email and phone_number fields.
3. Compose an appropriate notification message based on event type:
   - birth.registered: "The birth of {child_name} has been registered. Reference: {id}"
   - death.registered: "A death has been registered. Reference: {id}"
   - enrollment.created: "You have been enrolled in {program_name}. Reference: {id}"
   - vaccination.administered: "Vaccination recorded: {vaccine_name} dose {dose_number}"
4. If citizen has an email address, send an email notification (POST http://localhost:3005/notifications) with { citizen_id, channel: "email", destination: email, subject, body, source_system }.
5. If citizen has a phone_number, also send an SMS notification with the same content in abbreviated form.`,
      },
    ],
  },

  // ── Catalog-only (no homepage entry) ────────────────────────────────
  {
    id: "clinic-visit",
    name: "Clinic visit",
    description:
      "Record clinical encounters including check-ups and consultations, with diagnoses and provider notes.",
    categoryId: "health",
    dciAlignment: "Health — Clinical Encounters",
    href: "/services/clinic-visit",
    showOnHomepage: false,
    formBuilt: false,
    openfnConnected: false,
    customerJourney: [
      "Patient visits a health facility (clinic or hospital).",
      "Reception looks up the patient by national ID or registers them if first visit.",
      "Patient sees a provider for a check-up or consultation.",
      "Provider records the encounter: type, facility, diagnosis, and notes.",
      "Encounter is saved with a 'completed' status.",
      "Patient receives a summary of their visit.",
    ],
    systems: [
      {
        name: "Health",
        role: "Primary. Stores encounter records with type (checkup/consultation), facility, provider, diagnosis, and status.",
        port: 3003,
      },
      {
        name: "Identity",
        role: "Patient lookup by citizen ID. New patients are registered on first visit.",
        port: 3001,
      },
    ],
    simulationNotes: [
      "The clinic-visit.ts simulation script creates encounter records for random citizens at a rate of ~4 visits per citizen per year. Assigns random facilities, providers, and diagnoses.",
    ],
    openfnWorkflows: [
      {
        name: "Encounter completed → Notify patient",
        trigger: "Webhook: encounter.completed",
        description:
          "When a clinical encounter is completed, send the patient a visit summary notification.",
        prompt: `Build an OpenFn workflow that processes completed clinical encounters in SimDPG.

Trigger: Webhook event \`encounter.completed\` from Health (http://localhost:3003).

Payload: patient_id, citizen_id, encounter_type (checkup/consultation), facility, provider, diagnosis, status, encounter_date.

Steps:
1. Look up citizen details from Identity (GET http://localhost:3001/citizens/{citizen_id}).
2. Compose a visit summary including facility name, encounter type, diagnosis (if any), and any follow-up instructions.
3. Send the visit summary as a notification to the citizen (POST http://localhost:3005/notifications) with { citizen_id, channel: "email", subject: "Visit summary — {facility}", body: summary }.`,
      },
    ],
  },
];

export function getServiceById(id: string): ServiceDefinition | undefined {
  return SERVICES.find((s) => s.id === id);
}

export function getServicesByCategory(categoryId: string): ServiceDefinition[] {
  return SERVICES.filter((s) => s.categoryId === categoryId);
}

export function getHomepageServices(): ServiceDefinition[] {
  return SERVICES.filter((s) => s.showOnHomepage);
}
