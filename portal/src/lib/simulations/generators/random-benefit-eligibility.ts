import type { GeneratedEvent, GeneratorContext, RandomEventGenerator } from "./types";
import { daySteps, drawCount, pick } from "./pools";

/**
 * Steady daily-count benefit-eligibility generator (recurring). Each sampled
 * citizen always fires step 1 (lookup); with probability toStep2 it also fires
 * step 2 (check); only if step 2 fired, with probability toStep3 it fires
 * step 3 (enrol) — reproducing the incremental 1 / 1→2 / 1→2→3 access pattern.
 * `program_id` is drawn from the programmes fetched at generate-time; with no
 * programmes only step 1 is emitted.
 */
export const randomBenefitEligibility: RandomEventGenerator = {
  key: "random-benefit-eligibility",
  generate({ citizens, programs, dtSeconds, durationSeconds, random, config }: GeneratorContext): GeneratedEvent[] {
    const { dailyRatePerPopulation, chainProbabilities, stepDelaySeconds } = config.benefits;
    const steps = daySteps(durationSeconds, dtSeconds);
    const events: GeneratedEvent[] = [];
    if (citizens.length === 0) return events;

    for (const { day, fraction, stepSeconds } of steps) {
      const count = drawCount(dailyRatePerPopulation * citizens.length * fraction, random);
      for (let n = 0; n < count; n++) {
        const c = pick(citizens, random);
        const offset = Math.floor(random() * stepSeconds);
        const at = day * dtSeconds + offset;
        events.push({
          scheduledSimSeconds: at,
          targetKey: "benefit-eligibility-lookup",
          payload: { national_id: c.national_id },
        });

        if (programs.length === 0) continue;
        const programId = pick(programs, random).id;
        if (random() < chainProbabilities.toStep2) {
          events.push({
            scheduledSimSeconds: at + stepDelaySeconds,
            targetKey: "benefit-eligibility-check",
            payload: { citizen_id: c.id, program_id: programId },
          });
          if (random() < chainProbabilities.toStep3) {
            events.push({
              scheduledSimSeconds: at + 2 * stepDelaySeconds,
              targetKey: "benefit-eligibility-enrol",
              payload: { citizen_id: c.id, program_id: programId },
            });
          }
        }
      }
    }

    return events;
  },
};
