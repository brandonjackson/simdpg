/**
 * National ID application simulation.
 *
 * Triggers the "Apply for a national ID" workflow the same way the portal form
 * does — by POSTing an application payload — but without a browser. This is how
 * we exercise the OpenFn workflow at scale once the form-driven service moves
 * into the simulation.
 *
 * Target endpoint (first match wins):
 *   OPENFN_NATIONAL_ID_WEBHOOK_URL  - the OpenFn webhook (the real path), or
 *   PORTAL_URL + /api/apply/national-id - the portal's application endpoint.
 *
 * Config via env vars:
 *   APPLICATIONS                    - number of applications to submit (default 10)
 *   OPENFN_NATIONAL_ID_WEBHOOK_URL  - OpenFn webhook URL
 *   PORTAL_URL                      - portal base URL (default http://localhost:3000)
 */

import {
  maleGivenNames,
  femaleGivenNames,
  familyNames,
  cityNames,
} from "../names.js";
import { randomChoice, randomInt, log, logError } from "../utils.js";
import { Report } from "../report.js";

export interface ApplyConfig {
  endpoint: string;
  /** True when posting to OpenFn rather than the portal endpoint. */
  viaOpenfn: boolean;
  count: number;
}

export function applyConfigFromEnv(): ApplyConfig {
  const webhook = process.env.OPENFN_NATIONAL_ID_WEBHOOK_URL;
  const portal = process.env.PORTAL_URL ?? "http://localhost:3000";
  return {
    endpoint: webhook ?? `${portal}/api/apply/national-id`,
    viaOpenfn: Boolean(webhook),
    count: parseInt(process.env.APPLICATIONS ?? "10", 10),
  };
}

interface NationalIdApplication {
  given_name: string;
  family_name: string;
  date_of_birth: string;
  sex: "male" | "female";
  address_line_1: string;
  city: string;
  postal_code: string;
  email: string;
  phone_number: string | null;
}

function normalizeForEmail(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/** Build one realistic application payload. */
function randomApplication(): NationalIdApplication {
  const sex: "male" | "female" = Math.random() < 0.5 ? "male" : "female";
  const givenName = randomChoice(
    sex === "male" ? maleGivenNames : femaleGivenNames,
  );
  const familyName = randomChoice(familyNames);
  // Working-age applicants (18-70).
  const age = randomInt(18, 70);
  const birthYear = new Date().getFullYear() - age;
  const dob = `${birthYear}-${String(randomInt(1, 12)).padStart(2, "0")}-${String(randomInt(1, 28)).padStart(2, "0")}`;

  return {
    given_name: givenName,
    family_name: familyName,
    date_of_birth: dob,
    sex,
    address_line_1: `${randomInt(1, 999)} ${randomChoice(["Main St", "Oak Ave", "River Rd", "Market Ln", "Park Dr"])}`,
    city: randomChoice(cityNames),
    postal_code: String(randomInt(10000, 99999)),
    email: `${normalizeForEmail(givenName)}.${normalizeForEmail(familyName)}${randomInt(1, 999)}@simmail.gov`,
    phone_number: Math.random() < 0.5 ? `+1-555-${String(randomInt(1000, 9999))}` : null,
  };
}

async function submitApplication(
  endpoint: string,
  application: NationalIdApplication,
): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(application),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
}

export async function runApplications(config: ApplyConfig): Promise<Report> {
  const report = new Report();

  log("=== Submitting national ID applications ===");
  log(`Target:       ${config.endpoint}`);
  log(`Via OpenFn:   ${config.viaOpenfn ? "yes" : "no (portal endpoint)"}`);
  log(`Applications: ${config.count}`);

  for (let i = 0; i < config.count; i++) {
    const application = randomApplication();
    try {
      await submitApplication(config.endpoint, application);
      report.success("national-id-application");
    } catch (err) {
      logError(
        `Application failed for ${application.given_name} ${application.family_name}`,
        err,
      );
      report.failure(
        "national-id-application",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  report.finish();
  return report;
}
