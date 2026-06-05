/**
 * Configurable population generator (server-side).
 *
 * Builds a synthetic population by calling the Identity, Health, and Benefits
 * system APIs, honouring the options on a PopulationConfig. This is the engine
 * behind the staff population management page; the simulation CLI keeps its own
 * simpler env-driven generator for command-line use.
 */

import {
  IdentityClient,
  HealthClient,
  BenefitsClient,
  SYSTEM_URLS,
} from "@simdpg/api-clients";
import type {
  Citizen,
  CreateCitizenInput,
  Patient,
  Program,
} from "@simdpg/api-clients";
import { NAMES_BY_GROUP, cityNames, type EthnicGroup } from "./names";
import {
  AGE_BUCKETS,
  AGE_WEIGHTS,
  type PopulationConfig,
} from "./config";

// ---------------------------------------------------------------------------
// Random helpers
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedChoice<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function dobForAge(age: number): string {
  const year = new Date().getFullYear() - age;
  const month = randomInt(1, 12);
  const day = randomInt(1, 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function randomAge(config: PopulationConfig): number {
  const bucket = weightedChoice(AGE_BUCKETS, AGE_WEIGHTS[config.ageDistribution]);
  return randomInt(bucket.min, bucket.max);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

const CHRONIC_CONDITIONS = [
  "Type 2 diabetes",
  "Hypertension",
  "Asthma",
  "Chronic kidney disease",
  "Coronary heart disease",
  "Epilepsy",
  "Osteoarthritis",
];

// ---------------------------------------------------------------------------
// Household planning
// ---------------------------------------------------------------------------

interface HouseholdPlan {
  group: EthnicGroup;
  members: { input: CreateCitizenInput; relationship: "head" | "spouse" | "child" }[];
}

function pickGroupNames(group: EthnicGroup) {
  return NAMES_BY_GROUP[group];
}

function planHousehold(config: PopulationConfig, cities: string[]): HouseholdPlan {
  const group = randomChoice(config.ethnicityMix);
  const names = pickGroupNames(group);
  const familyName = randomChoice(names.family);
  const city = randomChoice(cities);

  const address = {
    type: "residential" as const,
    line_1: `${randomInt(1, 999)} ${randomChoice(["Main St", "Oak Ave", "River Rd", "Market Ln", "Park Dr", "Hill St", "Lake Rd", "Forest Ave"])}`,
    line_2: null,
    city,
    postal_code: String(randomInt(10000, 99999)),
    from_date: formatDate(new Date()),
    to_date: null,
  };

  const makeCitizen = (
    sex: "male" | "female",
    age: number,
  ): CreateCitizenInput => {
    const given = randomChoice(sex === "male" ? names.male : names.female);
    const isAdult = age >= 18;
    return {
      given_name: given,
      family_name: familyName,
      date_of_birth: dobForAge(age),
      sex,
      email:
        isAdult && Math.random() < 0.85
          ? `${normalize(given)}.${normalize(familyName)}${randomInt(1, 999)}@simmail.gov`
          : null,
      phone_number: isAdult && Math.random() < 0.9 ? `+1-555-${randomInt(1000, 9999)}` : null,
      addresses: [address],
    };
  };

  const members: HouseholdPlan["members"] = [];

  const headSex = Math.random() < 0.5 ? "male" : "female";
  const headAge = randomInt(25, 65);
  members.push({ input: makeCitizen(headSex, headAge), relationship: "head" });

  if (Math.random() < 0.7) {
    const spouseSex: "male" | "female" = headSex === "male" ? "female" : "male";
    members.push({
      input: makeCitizen(spouseSex, Math.max(18, headAge + randomInt(-5, 5))),
      relationship: "spouse",
    });
  }

  const numChildren = randomInt(
    config.householdChildren.min,
    config.householdChildren.max,
  );
  for (let i = 0; i < numChildren; i++) {
    const maxChildAge = Math.min(17, Math.max(0, headAge - 18));
    members.push({
      input: makeCitizen(Math.random() < 0.5 ? "male" : "female", randomInt(0, maxChildAge)),
      relationship: "child",
    });
  }

  return { group, members };
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await fn(current);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface GenerationResult {
  citizens: number;
  households: number;
  patients: number;
  conditions: number;
  enrollments: number;
  errors: number;
  durationMs: number;
  groupBreakdown: Record<string, number>;
}

export interface GenerateOptions {
  identityUrl?: string;
  healthUrl?: string;
  benefitsUrl?: string;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function generatePopulation(
  config: PopulationConfig,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const start = Date.now();
  const identity = new IdentityClient(options.identityUrl ?? SYSTEM_URLS.identity);
  const health = new HealthClient(options.healthUrl ?? SYSTEM_URLS.health);
  const benefits = new BenefitsClient(options.benefitsUrl ?? SYSTEM_URLS.benefits);

  const cities = cityNames.slice(0, Math.max(1, config.geographicSpread));

  // Plan households until we reach the target size.
  const plans: HouseholdPlan[] = [];
  let planned = 0;
  while (planned < config.size) {
    const plan = planHousehold(config, cities);
    plans.push(plan);
    planned += plan.members.length;
  }

  const groupBreakdown: Record<string, number> = {};
  for (const plan of plans) {
    groupBreakdown[plan.group] = (groupBreakdown[plan.group] ?? 0) + plan.members.length;
  }

  const result: GenerationResult = {
    citizens: 0,
    households: 0,
    patients: 0,
    conditions: 0,
    enrollments: 0,
    errors: 0,
    durationMs: 0,
    groupBreakdown,
  };

  const createdCitizens: Citizen[] = [];

  // Create households (with limited concurrency). Members of a single
  // household are created sequentially so the household can be linked.
  await mapWithConcurrency(plans, 8, async (plan) => {
    const memberRefs: { citizen_id: string; relationship: string }[] = [];
    for (const member of plan.members) {
      try {
        const citizen = await identity.createCitizen(member.input);
        createdCitizens.push(citizen);
        memberRefs.push({ citizen_id: citizen.id, relationship: member.relationship });
        result.citizens++;
      } catch {
        result.errors++;
      }
    }
    if (memberRefs.length > 0) {
      try {
        await identity.createHousehold(memberRefs);
        result.households++;
      } catch {
        result.errors++;
      }
    }
  });

  // Register every citizen as a patient, keeping the returned patient record
  // so the conditions step doesn't need a second lookup.
  const patientByCitizen = new Map<string, Patient>();
  await mapWithConcurrency(createdCitizens, 10, async (citizen) => {
    try {
      const patient = await health.registerPatient({ citizen_id: citizen.id });
      patientByCitizen.set(citizen.id, patient);
      result.patients++;
    } catch {
      result.errors++;
    }
  });

  // Pre-existing conditions: record a chronic-condition encounter for a
  // fraction of citizens (needs the patient record created above).
  if (config.preExistingConditionRate > 0) {
    const withCondition = createdCitizens.filter(
      () => Math.random() < config.preExistingConditionRate,
    );
    await mapWithConcurrency(withCondition, 10, async (citizen) => {
      try {
        const patient = patientByCitizen.get(citizen.id);
        if (!patient) return;
        await health.createEncounter({
          patient_id: patient.id,
          type: "consultation",
          date: formatDate(new Date()),
          facility: "City General Hospital",
          provider: "Dr. Sim",
          diagnosis: randomChoice(CHRONIC_CONDITIONS),
          notes: "Pre-existing condition recorded at population seeding.",
          status: "completed",
        });
        result.conditions++;
      } catch {
        result.errors++;
      }
    });
  }

  // Benefit eligibility: enroll a fraction of adults into a random active
  // programme.
  if (config.benefitEligibilityRate > 0) {
    let programs: Program[] = [];
    try {
      programs = await benefits.getPrograms("active");
    } catch {
      programs = [];
    }
    if (programs.length > 0) {
      const adults = createdCitizens.filter((c) => {
        const age = new Date().getFullYear() - new Date(c.date_of_birth).getFullYear();
        return age >= 18 && Math.random() < config.benefitEligibilityRate;
      });
      await mapWithConcurrency(adults, 10, async (citizen) => {
        try {
          const program = randomChoice(programs);
          await benefits.enroll({ program_id: program.id, citizen_id: citizen.id });
          result.enrollments++;
        } catch {
          result.errors++;
        }
      });
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}
