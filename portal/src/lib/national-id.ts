/**
 * National ID application — orchestration logic.
 *
 * This is the work the "ID application -> Deduplicate & create citizen" OpenFn
 * workflow performs. We keep a portal-side implementation so the form is usable
 * before OpenFn is wired up: the API route forwards to OpenFn when a webhook URL
 * is configured, and otherwise falls back to `processApplication` here.
 *
 * Steps: search Identity for duplicates -> return the existing ID on an exact
 * match -> flag near-matches for manual review -> otherwise create the citizen
 * and send a confirmation notification.
 */

import { ApiError, type Citizen } from "@simdpg/api-clients";
import { identity, notifications } from "@/lib/systems";

/** The payload a national ID application carries (from the portal form). */
export interface NationalIdApplication {
  given_name: string;
  family_name: string;
  date_of_birth: string; // YYYY-MM-DD
  sex: "male" | "female";
  address_line_1: string;
  city: string;
  postal_code: string;
  /** Contact details for the confirmation notification (at least one). */
  email?: string | null;
  phone_number?: string | null;
}

export type ApplicationResult =
  | {
      status: "created";
      national_id: string;
      citizen: Citizen;
      notified: boolean;
    }
  | {
      status: "existing";
      national_id: string;
      citizen: Citizen;
      notified: boolean;
    }
  | {
      status: "review";
      reason: string;
      candidates: { national_id: string; name: string; date_of_birth: string }[];
    }
  | { status: "queued"; reason: string };

const REQUIRED_FIELDS: (keyof NationalIdApplication)[] = [
  "given_name",
  "family_name",
  "date_of_birth",
  "sex",
  "address_line_1",
  "city",
  "postal_code",
];

/** Validate an application payload; returns a list of human-readable problems. */
export function validateApplication(input: Partial<NationalIdApplication>): string[] {
  const problems: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const value = input[field];
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`${field.replace(/_/g, " ")} is required`);
    }
  }
  if (input.sex && input.sex !== "male" && input.sex !== "female") {
    problems.push("sex must be 'male' or 'female'");
  }
  if (!input.email && !input.phone_number) {
    problems.push("an email address or phone number is required for confirmation");
  }
  return problems;
}

const normalize = (s: string | null | undefined): string =>
  (s ?? "").trim().toLowerCase();

/** Same person beyond doubt: name + DOB + sex all match. */
function isExactMatch(c: Citizen, app: NationalIdApplication): boolean {
  return (
    normalize(c.given_name) === normalize(app.given_name) &&
    normalize(c.family_name) === normalize(app.family_name) &&
    c.date_of_birth === app.date_of_birth &&
    normalize(c.sex) === normalize(app.sex)
  );
}

/**
 * Likely-but-uncertain match worth a manual check rather than a silent create:
 * shares the date of birth and one name part, or shares the full name. This is
 * the fuzzy guard against creating duplicates from typos or partial entries.
 */
function isNearMatch(c: Citizen, app: NationalIdApplication): boolean {
  const sameGiven = normalize(c.given_name) === normalize(app.given_name);
  const sameFamily = normalize(c.family_name) === normalize(app.family_name);
  const sameDob = c.date_of_birth === app.date_of_birth;
  return (sameDob && (sameGiven || sameFamily)) || (sameGiven && sameFamily);
}

/** Pick the notification channel from whichever contact detail was provided. */
function contactChannel(
  app: NationalIdApplication,
): { channel: "email" | "sms"; destination: string } | null {
  if (app.email) return { channel: "email", destination: app.email };
  if (app.phone_number) return { channel: "sms", destination: app.phone_number };
  return null;
}

async function sendConfirmation(
  citizen: Citizen,
  app: NationalIdApplication,
  alreadyHadId: boolean,
): Promise<boolean> {
  const contact = contactChannel(app);
  if (!contact) return false;

  const body = alreadyHadId
    ? `You already have a national ID on record: ${citizen.national_id}. No new ID was issued.`
    : `Your national ID application is complete. Your national ID is ${citizen.national_id}.`;

  try {
    await notifications.send({
      citizen_id: citizen.id,
      channel: contact.channel,
      destination: contact.destination,
      subject: "Your national ID",
      body,
      source_system: "identity",
      source_event: "citizen.created",
    });
    return true;
  } catch {
    // A failed confirmation must not fail the whole application — the ID is
    // already issued. Report it as un-notified so the caller can surface it.
    return false;
  }
}

/**
 * Run the full deduplicate-and-create flow for one application.
 * Throws nothing for expected outcomes — they are returned as a status.
 */
export async function processApplication(
  app: NationalIdApplication,
): Promise<ApplicationResult> {
  let candidates: Citizen[];
  try {
    candidates = await identity.searchCitizens({
      name: `${app.given_name} ${app.family_name}`,
      dob: app.date_of_birth,
    });
  } catch (err) {
    // Identity unavailable (5xx / network) -> queue for retry rather than fail.
    if (err instanceof ApiError && err.status < 500) throw err;
    return {
      status: "queued",
      reason: "Identity service is unavailable. The application has been queued for retry.",
    };
  }

  const exact = candidates.find((c) => isExactMatch(c, app));
  if (exact) {
    const notified = await sendConfirmation(exact, app, true);
    return {
      status: "existing",
      national_id: exact.national_id,
      citizen: exact,
      notified,
    };
  }

  const near = candidates.filter((c) => isNearMatch(c, app));
  if (near.length > 0) {
    return {
      status: "review",
      reason:
        "A similar citizen record already exists. The application has been flagged for manual review to prevent a duplicate.",
      candidates: near.map((c) => ({
        national_id: c.national_id,
        name: `${c.given_name} ${c.family_name}`,
        date_of_birth: c.date_of_birth,
      })),
    };
  }

  let citizen: Citizen;
  try {
    citizen = await identity.createCitizen({
      given_name: app.given_name,
      family_name: app.family_name,
      date_of_birth: app.date_of_birth,
      sex: app.sex,
      email: app.email ?? null,
      phone_number: app.phone_number ?? null,
      addresses: [
        {
          type: "residential",
          line_1: app.address_line_1,
          line_2: null,
          city: app.city,
          postal_code: app.postal_code,
          from_date: new Date().toISOString().slice(0, 10),
          to_date: null,
        },
      ],
    });
  } catch (err) {
    if (err instanceof ApiError && err.status < 500) throw err;
    return {
      status: "queued",
      reason: "Identity service is unavailable. The application has been queued for retry.",
    };
  }

  const notified = await sendConfirmation(citizen, app, false);
  return { status: "created", national_id: citizen.national_id, citizen, notified };
}
