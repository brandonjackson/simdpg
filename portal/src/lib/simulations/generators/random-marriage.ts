import type { GeneratedEvent, GeneratorContext, RandomEventGenerator } from "./types";
import { GENERATOR_CONFIG } from "./config";
import { cityNames, drawCount, isAdult, pick, sampleWithoutReplacement, simDayToDate } from "./pools";

/**
 * Steady daily-count marriage generator (recurring). Expected marriages/day =
 * dailyRatePerPopulation × population. Each marriage pairs two distinct random
 * alive adults (no opposite-sex constraint, per the #72 spec).
 */
export const randomMarriage: RandomEventGenerator = {
  key: "random-marriage",
  generate({ citizens, dtSeconds, durationSeconds, random }: GeneratorContext): GeneratedEvent[] {
    const { dailyRatePerPopulation } = GENERATOR_CONFIG.marriage;
    const numDays = Math.floor(durationSeconds / dtSeconds);
    const adults = citizens.filter((c) => isAdult(c.date_of_birth));
    const events: GeneratedEvent[] = [];
    if (adults.length < 2) return events;

    for (let day = 0; day < numDays; day++) {
      const count = drawCount(dailyRatePerPopulation * citizens.length, random);
      for (let m = 0; m < count; m++) {
        const [a, b] = sampleWithoutReplacement(adults, 2, random);
        const offset = Math.floor(random() * dtSeconds);
        events.push({
          scheduledSimSeconds: day * dtSeconds + offset,
          targetKey: "marriage-registration",
          payload: {
            spouse_1_national_id: a.national_id,
            spouse_2_national_id: b.national_id,
            date_of_marriage: simDayToDate(day),
            place_of_marriage: pick(cityNames, random),
          },
        });
      }
    }

    return events;
  },
};
