import type { GeneratedEvent, GeneratorContext, RandomEventGenerator } from "./types";
import {
  cityNames,
  daySteps,
  drawCount,
  femaleGivenNames,
  isAdult,
  maleGivenNames,
  pick,
  simDayToDate,
} from "./pools";

/**
 * Steady daily-count birth generator (recurring). Expected births/day =
 * dailyRatePerPopulation × population. Each birth draws a random adult mother,
 * an optional adult father, and a fabricated newborn.
 */
export const randomBirth: RandomEventGenerator = {
  key: "random-birth",
  generate({ citizens, dtSeconds, durationSeconds, random, config }: GeneratorContext): GeneratedEvent[] {
    const { dailyRatePerPopulation } = config.birth;
    const steps = daySteps(durationSeconds, dtSeconds);
    const mothers = citizens.filter((c) => c.sex === "female" && isAdult(c.date_of_birth));
    const fathers = citizens.filter((c) => c.sex === "male" && isAdult(c.date_of_birth));
    const events: GeneratedEvent[] = [];
    if (mothers.length === 0) return events;

    for (const { day, fraction, stepSeconds } of steps) {
      const count = drawCount(dailyRatePerPopulation * citizens.length * fraction, random);
      for (let b = 0; b < count; b++) {
        const mother = pick(mothers, random);
        const offset = Math.floor(random() * stepSeconds);
        const sex: "male" | "female" = random() < 0.5 ? "male" : "female";
        const givenName = pick(sex === "male" ? maleGivenNames : femaleGivenNames, random);
        const father = fathers.length > 0 ? pick(fathers, random) : null;
        const payload: Record<string, unknown> = {
          mother_national_id: mother.national_id,
          given_name: givenName,
          family_name: mother.family_name,
          date_of_birth: simDayToDate(day),
          sex,
          place_of_birth: pick(cityNames, random),
        };
        if (father) payload.father_national_id = father.national_id;
        events.push({
          scheduledSimSeconds: day * dtSeconds + offset,
          targetKey: "birth-registration",
          payload,
        });
      }
    }

    return events;
  },
};
