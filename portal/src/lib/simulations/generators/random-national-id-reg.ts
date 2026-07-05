import type { Citizen } from "@simdpg/api-clients";
import type { GeneratedEvent, RandomEventGenerator } from "./types";

/**
 * Daily probability that an alive citizen submits a national-ID registration.
 * Placeholder tuned for observability (a visible handful of events for a typical
 * population/duration), NOT demographic realism. A future ticket makes this and
 * `dt` configurable.
 */
export const NATIONAL_ID_DAILY_PROB = 0.02;

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

export const randomNationalIdReg: RandomEventGenerator = {
  key: "random-national-id-reg",
  generate({ citizens, dtSeconds, durationSeconds, random }) {
    const numDays = Math.floor(durationSeconds / dtSeconds);
    const events: GeneratedEvent[] = [];

    for (const citizen of citizens) {
      for (let day = 0; day < numDays; day++) {
        if (random() < NATIONAL_ID_DAILY_PROB) {
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
