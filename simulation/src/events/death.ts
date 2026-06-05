/**
 * Death event generator.
 *
 * Rate: ~8 deaths per 1000 population per year.
 * Selection weighted by age: much higher probability for elderly (65+),
 * very low for young adults.
 */

import {
  IdentityClient,
  CivilRegistryClient,
} from "@simdpg/api-clients";
import type { Citizen } from "@simdpg/api-clients";
import {
  weightedChoice,
  randomChoice,
  ageFromDob,
  formatDate,
  log,
  logError,
} from "../utils.js";
import { cityNames } from "../names.js";
import { Report } from "../report.js";

export interface DeathConfig {
  identityUrl: string;
  civilRegistryUrl: string;
  citizens: Citizen[];
  simulationDate: Date;
}

const CAUSES_OF_DEATH = [
  "Natural causes",
  "Cardiovascular disease",
  "Respiratory illness",
  "Infectious disease",
  "Cancer",
  "Accident",
  "Stroke",
  "Diabetes complications",
];

/**
 * Returns a death weight for a given age.
 * Elderly have much higher probability; young adults very low.
 */
function deathWeight(age: number): number {
  if (age < 1) return 5;      // infant mortality
  if (age < 5) return 2;
  if (age < 15) return 0.5;
  if (age < 25) return 1;
  if (age < 35) return 1.5;
  if (age < 45) return 2;
  if (age < 55) return 4;
  if (age < 65) return 8;
  if (age < 75) return 20;
  if (age < 85) return 40;
  return 60;
}

export async function runDeaths(config: DeathConfig, report: Report): Promise<number> {
  const identity = new IdentityClient(config.identityUrl);
  const civilRegistry = new CivilRegistryClient(config.civilRegistryUrl);
  const now = config.simulationDate;

  const aliveCitizens = config.citizens.filter((c) => c.status === "alive");

  // Rate: 8 per 1000 per year
  const expectedDeaths = Math.max(1, Math.round((aliveCitizens.length * 8) / 1000));

  log(`Death event: ${expectedDeaths} deaths planned from ${aliveCitizens.length} alive citizens`);

  // Build weighted list
  const weights = aliveCitizens.map((c) => deathWeight(ageFromDob(c.date_of_birth, now)));

  // Select unique citizens for death
  const selected = new Set<string>();
  const deaths: Citizen[] = [];
  const maxAttempts = expectedDeaths * 3;
  let attempts = 0;

  while (deaths.length < expectedDeaths && attempts < maxAttempts) {
    const citizen = weightedChoice(aliveCitizens, weights);
    if (!selected.has(citizen.id)) {
      selected.add(citizen.id);
      deaths.push(citizen);
    }
    attempts++;
  }

  let deathCount = 0;

  for (const citizen of deaths) {
    try {
      // Update citizen status
      await identity.updateCitizen(citizen.id, {
        date_of_death: formatDate(now),
        status: "deceased",
      });
      report.success("death:citizen_update");

      // Register death in civil registry
      try {
        const age = ageFromDob(citizen.date_of_birth, now);
        await civilRegistry.registerDeath({
          citizen_id: citizen.id,
          date_of_death: formatDate(now),
          place_of_death: randomChoice(cityNames),
          cause_of_death: age >= 65
            ? randomChoice(CAUSES_OF_DEATH)
            : randomChoice(CAUSES_OF_DEATH.slice(0, 6)),
        });
        report.success("death:registration");
      } catch (err) {
        report.failure("death:registration", err instanceof Error ? err.message : String(err));
        logError("Failed to register death", err);
      }

      deathCount++;
    } catch (err) {
      report.failure("death:citizen_update", err instanceof Error ? err.message : String(err));
      logError(`Failed to update citizen ${citizen.id} as deceased`, err);
    }
  }

  log(`Death event complete: ${deathCount} deaths`);
  return deathCount;
}
