/**
 * Marriage event generator.
 *
 * Rate: ~7 marriages per 1000 population per year.
 * Selects unmarried adults (18+) and pairs them.
 */

import { CivilRegistryClient } from "@simdpg/api-clients";
import type { Citizen } from "@simdpg/api-clients";
import {
  randomChoice,
  ageFromDob,
  formatDate,
  log,
  logError,
} from "../utils.js";
import { cityNames } from "../names.js";
import { Report } from "../report.js";

export interface MarriageConfig {
  civilRegistryUrl: string;
  citizens: Citizen[];
  simulationDate: Date;
}

export async function runMarriages(config: MarriageConfig, report: Report): Promise<number> {
  const civilRegistry = new CivilRegistryClient(config.civilRegistryUrl);
  const now = config.simulationDate;

  // Filter: alive adults 18+
  const eligibleAdults = config.citizens.filter((c) => {
    if (c.status !== "alive") return false;
    const age = ageFromDob(c.date_of_birth, now);
    return age >= 18;
  });

  // Rate: 7 marriages per 1000 population per year
  // Each marriage involves 2 people, so we need 2x the marriages in people
  const expectedMarriages = Math.max(1, Math.round((config.citizens.length * 7) / 1000));

  log(`Marriage event: ${expectedMarriages} marriages planned from ${eligibleAdults.length} eligible adults`);

  // Shuffle eligible adults and pair them (alternating from list)
  const shuffled = [...eligibleAdults].sort(() => Math.random() - 0.5);
  const numPairs = Math.min(expectedMarriages, Math.floor(shuffled.length / 2));

  let marriageCount = 0;

  for (let i = 0; i < numPairs; i++) {
    const spouse1 = shuffled[i * 2];
    const spouse2 = shuffled[i * 2 + 1];

    try {
      await civilRegistry.registerMarriage({
        spouse_1_citizen_id: spouse1.id,
        spouse_2_citizen_id: spouse2.id,
        date_of_marriage: formatDate(now),
        place_of_marriage: randomChoice(cityNames),
      });
      report.success("marriage");
      marriageCount++;
    } catch (err) {
      report.failure("marriage", err instanceof Error ? err.message : String(err));
      logError(`Failed to register marriage for ${spouse1.id} & ${spouse2.id}`, err);
    }
  }

  log(`Marriage event complete: ${marriageCount} marriages`);
  return marriageCount;
}
