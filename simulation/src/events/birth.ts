/**
 * Birth event generator.
 *
 * Rate: ~15 births per 1000 population per year.
 * Selects women aged 18-45, finds a father (spouse or random male adult),
 * creates a newborn citizen in identity and registers the birth in civil registry.
 */

import {
  IdentityClient,
  CivilRegistryClient,
  HealthClient,
} from "@simdpg/api-clients";
import type { Citizen } from "@simdpg/api-clients";
import {
  randomChoice,
  randomInt,
  ageFromDob,
  formatDate,
  log,
  logError,
} from "../utils.js";
import {
  maleGivenNames,
  femaleGivenNames,
  cityNames,
} from "../names.js";
import { Report } from "../report.js";

export interface BirthConfig {
  identityUrl: string;
  civilRegistryUrl: string;
  healthUrl: string;
  citizens: Citizen[];
  simulationDate: Date;
}

export async function runBirths(config: BirthConfig, report: Report): Promise<number> {
  const identity = new IdentityClient(config.identityUrl);
  const civilRegistry = new CivilRegistryClient(config.civilRegistryUrl);
  const health = new HealthClient(config.healthUrl);
  const now = config.simulationDate;

  // Filter eligible mothers: women aged 18-45 who are alive
  const eligibleMothers = config.citizens.filter((c) => {
    if (c.sex !== "female" || c.status !== "alive") return false;
    const age = ageFromDob(c.date_of_birth, now);
    return age >= 18 && age <= 45;
  });

  // Filter adult males for potential fathers
  const adultMales = config.citizens.filter((c) => {
    if (c.sex !== "male" || c.status !== "alive") return false;
    const age = ageFromDob(c.date_of_birth, now);
    return age >= 18;
  });

  // Rate: 15 per 1000 per year
  const expectedBirths = Math.max(1, Math.round((config.citizens.length * 15) / 1000));
  const numBirths = Math.min(expectedBirths, eligibleMothers.length);

  log(`Birth event: ${numBirths} births planned from ${eligibleMothers.length} eligible mothers`);

  // Shuffle and pick mothers
  const shuffled = [...eligibleMothers].sort(() => Math.random() - 0.5);
  const selectedMothers = shuffled.slice(0, numBirths);

  let birthCount = 0;

  for (const mother of selectedMothers) {
    try {
      // Pick a father
      const father = adultMales.length > 0 ? randomChoice(adultMales) : null;

      // Generate newborn
      const sex: "male" | "female" = Math.random() < 0.5 ? "male" : "female";
      const givenName = sex === "male"
        ? randomChoice(maleGivenNames)
        : randomChoice(femaleGivenNames);

      const newborn = await identity.createCitizen({
        given_name: givenName,
        family_name: mother.family_name,
        date_of_birth: formatDate(now),
        sex,
      });
      report.success("birth:citizen");

      // Register as patient
      try {
        await health.registerPatient({ citizen_id: newborn.id });
        report.success("birth:patient");
      } catch (err) {
        report.failure("birth:patient", err instanceof Error ? err.message : String(err));
        logError("Failed to register newborn as patient", err);
      }

      // Register birth in civil registry
      try {
        await civilRegistry.registerBirth({
          child_citizen_id: newborn.id,
          mother_citizen_id: mother.id,
          father_citizen_id: father?.id,
          date_of_birth: formatDate(now),
          place_of_birth: randomChoice(cityNames),
        });
        report.success("birth:registration");
      } catch (err) {
        report.failure("birth:registration", err instanceof Error ? err.message : String(err));
        logError("Failed to register birth", err);
      }

      birthCount++;
    } catch (err) {
      report.failure("birth:citizen", err instanceof Error ? err.message : String(err));
      logError("Failed to create newborn citizen", err);
    }
  }

  log(`Birth event complete: ${birthCount} births`);
  return birthCount;
}
