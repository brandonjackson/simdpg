/**
 * Population generator.
 *
 * Creates a seed population with realistic demographics by calling the
 * Identity service API.  Each citizen is also registered as a patient in
 * the Health service.
 *
 * Config via env vars:
 *   POPULATION_SIZE  - target number of citizens (default 100)
 *   IDENTITY_URL     - identity service base URL
 *   HEALTH_URL       - health service base URL
 */

import {
  IdentityClient,
  HealthClient,
  SERVICE_URLS,
} from "@simdpg/api-clients";
import type { Citizen, CreateCitizenInput } from "@simdpg/api-clients";
import {
  maleGivenNames,
  femaleGivenNames,
  familyNames,
  cityNames,
} from "./names.js";
import {
  randomChoice,
  randomInt,
  weightedChoice,
  formatDate,
  log,
  logError,
} from "./utils.js";
import { Report } from "./report.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random date-of-birth for a given age. */
function dobForAge(age: number, referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear() - age;
  const month = randomInt(1, 12);
  const day = randomInt(1, 28); // safe for all months
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Pick an age from a realistic population pyramid. */
function randomAge(): number {
  // Weighted age buckets: more young people, fewer elderly
  const buckets = [
    { min: 0, max: 4 },
    { min: 5, max: 14 },
    { min: 15, max: 24 },
    { min: 25, max: 34 },
    { min: 35, max: 44 },
    { min: 45, max: 54 },
    { min: 55, max: 64 },
    { min: 65, max: 74 },
    { min: 75, max: 90 },
  ];
  const weights = [12, 18, 17, 15, 13, 10, 8, 5, 2];
  const bucket = weightedChoice(buckets, weights);
  return randomInt(bucket.min, bucket.max);
}

function randomSex(): "male" | "female" {
  return Math.random() < 0.5 ? "male" : "female";
}

function randomGivenName(sex: "male" | "female"): string {
  return sex === "male" ? randomChoice(maleGivenNames) : randomChoice(femaleGivenNames);
}

function randomAddress() {
  const city = randomChoice(cityNames);
  return {
    type: "residential" as const,
    line_1: `${randomInt(1, 999)} ${randomChoice(["Main St", "Oak Ave", "River Rd", "Market Ln", "Park Dr", "Hill St", "Lake Rd", "Forest Ave"])}`,
    line_2: null,
    city,
    postal_code: String(randomInt(10000, 99999)),
    from_date: formatDate(new Date()),
    to_date: null,
  };
}

function randomEmail(givenName: string, familyName: string): string {
  const normalized = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  return `${normalized(givenName)}.${normalized(familyName)}${randomInt(1, 999)}@simmail.gov`;
}

function randomPhoneNumber(): string {
  return `+1-555-${String(randomInt(1000, 9999))}`;
}

// ---------------------------------------------------------------------------
// Household generation
// ---------------------------------------------------------------------------

interface HouseholdPlan {
  head: CreateCitizenInput;
  spouse: CreateCitizenInput | null;
  children: CreateCitizenInput[];
}

function planHousehold(): HouseholdPlan {
  const familyName = randomChoice(familyNames);
  const address = randomAddress();

  // Head: adult 25-65
  const headAge = randomInt(25, 65);
  const headSex = randomSex();
  const headGivenName = randomGivenName(headSex);
  const head: CreateCitizenInput = {
    given_name: headGivenName,
    family_name: familyName,
    date_of_birth: dobForAge(headAge),
    sex: headSex,
    email: Math.random() < 0.85 ? randomEmail(headGivenName, familyName) : null,
    phone_number: Math.random() < 0.9 ? randomPhoneNumber() : null,
    addresses: [address],
  };

  // Optional spouse (~70% chance)
  let spouse: CreateCitizenInput | null = null;
  if (Math.random() < 0.7) {
    const spouseSex: "male" | "female" = headSex === "male" ? "female" : "male";
    const spouseAge = headAge + randomInt(-5, 5);
    const spouseGivenName = randomGivenName(spouseSex);
    spouse = {
      given_name: spouseGivenName,
      family_name: familyName,
      date_of_birth: dobForAge(Math.max(18, spouseAge)),
      sex: spouseSex,
      email: Math.random() < 0.85 ? randomEmail(spouseGivenName, familyName) : null,
      phone_number: Math.random() < 0.9 ? randomPhoneNumber() : null,
      addresses: [address],
    };
  }

  // Children: 0-4, ages realistic given parent ages
  const numChildren = weightedChoice([0, 1, 2, 3, 4], [15, 25, 30, 20, 10]);
  const children: CreateCitizenInput[] = [];
  for (let i = 0; i < numChildren; i++) {
    const maxChildAge = Math.max(0, headAge - 18);
    const childAge = maxChildAge > 0 ? randomInt(0, Math.min(maxChildAge, 17)) : 0;
    const childSex = randomSex();
    const childGivenName = randomGivenName(childSex);
    const isAdult = childAge >= 18;
    children.push({
      given_name: childGivenName,
      family_name: familyName,
      date_of_birth: dobForAge(childAge),
      sex: childSex,
      email: isAdult && Math.random() < 0.7 ? randomEmail(childGivenName, familyName) : null,
      phone_number: isAdult && Math.random() < 0.8 ? randomPhoneNumber() : null,
      addresses: [address],
    });
  }

  return { head, spouse, children };
}

// ---------------------------------------------------------------------------
// Main generate function
// ---------------------------------------------------------------------------

export interface GenerateConfig {
  populationSize: number;
  identityUrl: string;
  healthUrl: string;
}

export function configFromEnv(): GenerateConfig {
  return {
    populationSize: parseInt(process.env.POPULATION_SIZE ?? "100", 10),
    identityUrl: process.env.IDENTITY_URL ?? SERVICE_URLS.identity,
    healthUrl: process.env.HEALTH_URL ?? SERVICE_URLS.health,
  };
}

export async function generate(config: GenerateConfig): Promise<Report> {
  const identity = new IdentityClient(config.identityUrl);
  const health = new HealthClient(config.healthUrl);
  const report = new Report();

  log(`Generating population of ~${config.populationSize} citizens...`);
  log(`Identity service: ${config.identityUrl}`);
  log(`Health service:   ${config.healthUrl}`);

  // Build household plans until we reach the target population size
  const plans: HouseholdPlan[] = [];
  let planned = 0;
  while (planned < config.populationSize) {
    const plan = planHousehold();
    plans.push(plan);
    planned += 1 + (plan.spouse ? 1 : 0) + plan.children.length;
  }

  log(`Planned ${plans.length} households (${planned} citizens)`);

  const allCitizens: Citizen[] = [];
  let householdsCreated = 0;

  for (const plan of plans) {
    try {
      // Create head
      const headCitizen = await identity.createCitizen(plan.head);
      report.success("citizen");
      allCitizens.push(headCitizen);

      const members: { citizen_id: string; relationship: string }[] = [
        { citizen_id: headCitizen.id, relationship: "head" },
      ];

      // Create spouse
      if (plan.spouse) {
        try {
          const spouseCitizen = await identity.createCitizen(plan.spouse);
          report.success("citizen");
          allCitizens.push(spouseCitizen);
          members.push({ citizen_id: spouseCitizen.id, relationship: "spouse" });
        } catch (err) {
          report.failure("citizen", err instanceof Error ? err.message : String(err));
          logError("Failed to create spouse", err);
        }
      }

      // Create children
      for (const child of plan.children) {
        try {
          const childCitizen = await identity.createCitizen(child);
          report.success("citizen");
          allCitizens.push(childCitizen);
          members.push({ citizen_id: childCitizen.id, relationship: "child" });
        } catch (err) {
          report.failure("citizen", err instanceof Error ? err.message : String(err));
          logError("Failed to create child", err);
        }
      }

      // Create household
      try {
        await identity.createHousehold(members);
        report.success("household");
      } catch (err) {
        report.failure("household", err instanceof Error ? err.message : String(err));
        logError("Failed to create household", err);
      }

      householdsCreated++;
      if (householdsCreated % 10 === 0) {
        log(`  ... ${householdsCreated}/${plans.length} households created (${allCitizens.length} citizens)`);
      }
    } catch (err) {
      report.failure("citizen", err instanceof Error ? err.message : String(err));
      logError("Failed to create household head", err);
    }
  }

  log(`Created ${allCitizens.length} citizens in ${householdsCreated} households`);

  // Register each citizen as a patient in the health service
  log("Registering citizens as patients in health service...");
  let patientsRegistered = 0;
  for (const citizen of allCitizens) {
    try {
      await health.registerPatient({ citizen_id: citizen.id });
      report.success("patient");
      patientsRegistered++;
      if (patientsRegistered % 50 === 0) {
        log(`  ... ${patientsRegistered}/${allCitizens.length} patients registered`);
      }
    } catch (err) {
      report.failure("patient", err instanceof Error ? err.message : String(err));
      logError(`Failed to register patient for citizen ${citizen.id}`, err);
    }
  }

  log(`Registered ${patientsRegistered} patients`);

  // Print summary stats
  const ageBuckets: Record<string, number> = {
    "0-14": 0,
    "15-24": 0,
    "25-44": 0,
    "45-64": 0,
    "65+": 0,
  };
  const now = new Date();
  let males = 0;
  let females = 0;
  for (const c of allCitizens) {
    const birth = new Date(c.date_of_birth);
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;

    if (age < 15) ageBuckets["0-14"]++;
    else if (age < 25) ageBuckets["15-24"]++;
    else if (age < 45) ageBuckets["25-44"]++;
    else if (age < 65) ageBuckets["45-64"]++;
    else ageBuckets["65+"]++;

    if (c.sex === "male") males++;
    else females++;
  }

  report.finish();

  log("");
  log("=== Generation Summary ===");
  log(`Total citizens: ${allCitizens.length}`);
  log(`Households:     ${householdsCreated}`);
  log(`Patients:       ${patientsRegistered}`);
  log(`Sex: M=${males} F=${females}`);
  log("Age distribution:");
  for (const [bucket, count] of Object.entries(ageBuckets)) {
    const pct = allCitizens.length > 0 ? ((count / allCitizens.length) * 100).toFixed(1) : "0.0";
    log(`  ${bucket}: ${count} (${pct}%)`);
  }

  return report;
}
