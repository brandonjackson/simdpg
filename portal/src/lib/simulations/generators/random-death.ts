import type { GeneratedEvent, GeneratorContext, RandomEventGenerator } from "./types";
import { GENERATOR_CONFIG } from "./config";
import {
  CAUSES_OF_DEATH,
  cityNames,
  drawCount,
  pick,
  sampleWithoutReplacement,
  simDayToDate,
} from "./pools";

/**
 * Steady daily-count death generator, once per citizen via a draining pool so
 * deaths spread uniformly across the run instead of front-loading.
 *
 * Emits TWO events per death — `death-registration-lookup` then
 * `death-registration-preview`. It deliberately does NOT emit step 3
 * (`death-registration-confirm`): that payload is the runtime *response* of the
 * preview step (computed enrollment/payment data), which the fire-and-forget
 * scheduler discards and a pure generator cannot fabricate at generate-time.
 * See the #72 spec.
 */
export const randomDeath: RandomEventGenerator = {
  key: "random-death",
  generate({ citizens, dtSeconds, durationSeconds, random }: GeneratorContext): GeneratedEvent[] {
    const { dailyRatePerPopulation, stepDelaySeconds } = GENERATOR_CONFIG.death;
    const numDays = Math.floor(durationSeconds / dtSeconds);
    const events: GeneratedEvent[] = [];
    let remaining = citizens.slice(); // draining pool

    for (let day = 0; day < numDays && remaining.length > 0; day++) {
      const count = drawCount(dailyRatePerPopulation * remaining.length, random);
      const dying = sampleWithoutReplacement(remaining, count, random);
      if (dying.length === 0) continue;
      const dyingSet = new Set(dying);
      remaining = remaining.filter((c) => !dyingSet.has(c));

      for (const c of dying) {
        const offset = Math.floor(random() * dtSeconds);
        const lookupAt = day * dtSeconds + offset;
        events.push({
          scheduledSimSeconds: lookupAt,
          targetKey: "death-registration-lookup",
          payload: { national_id: c.national_id },
        });
        events.push({
          scheduledSimSeconds: lookupAt + stepDelaySeconds,
          targetKey: "death-registration-preview",
          payload: {
            citizen_data: c,
            userInput: {
              dateOfDeath: simDayToDate(day),
              placeOfDeath: pick(cityNames, random),
              causeOfDeath: pick(CAUSES_OF_DEATH, random),
            },
          },
        });
      }
    }

    return events;
  },
};
