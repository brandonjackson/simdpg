import type { Citizen } from "@simdpg/api-clients";
import type { GeneratedEvent, GeneratorContext, RandomEventGenerator } from "./types";
import { GENERATOR_CONFIG } from "./config";

function buildPayload(c: Citizen) {
  const addr = c.addresses?.[0];
  return {
    given_name: c.given_name,
    family_name: c.family_name,
    date_of_birth: c.date_of_birth,
    sex: c.sex,
    address_line_1: addr?.line_1 ?? "",
    city: addr?.city ?? "",
    postal_code: addr?.postal_code ?? "",
    email: c.email,
    phone_number: c.phone_number,
  };
}

/**
 * National-ID registration generator. One-time geometric per citizen: each
 * alive citizen rolls a daily Bernoulli and registers once, on the first
 * success. Arrivals are front-loaded ("everyone eventually registers, mostly
 * early"), which is acceptable for ID uptake. The daily probability comes from
 * the configurable weights asset (see config.ts).
 */
export const randomNationalIdReg: RandomEventGenerator = {
  key: "random-national-id-reg",
  generate({ citizens, dtSeconds, durationSeconds, random }: GeneratorContext): GeneratedEvent[] {
    const dailyProb = GENERATOR_CONFIG.nationalId.dailyProbPerCitizen;
    const numDays = Math.floor(durationSeconds / dtSeconds);
    const events: GeneratedEvent[] = [];

    for (const citizen of citizens) {
      for (let day = 0; day < numDays; day++) {
        if (random() < dailyProb) {
          const offset = Math.floor(random() * dtSeconds);
          events.push({
            scheduledSimSeconds: day * dtSeconds + offset,
            targetKey: "national-id",
            payload: buildPayload(citizen),
          });
          break; // one registration per citizen
        }
      }
    }

    return events;
  },
};
