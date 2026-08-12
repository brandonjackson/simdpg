import { describe, it, expect } from "vitest";
import type { Citizen } from "@simdpg/api-clients";
import type { GeneratorContext } from "./types";
import { randomBirth } from "./random-birth";
import { GENERATOR_CONFIG } from "./config";

function citizen(over: Partial<Citizen> = {}): Citizen {
  return {
    id: "c1", national_id: "NID-1", given_name: "Ada", family_name: "Lovelace",
    date_of_birth: "1990-01-01", sex: "female", email: null, phone_number: null,
    date_of_death: null, status: "alive", created_at: "2020-01-01",
    updated_at: "2020-01-01", addresses: [], ...over,
  };
}

function seq(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 1);
}

function ctx(over: Partial<GeneratorContext> = {}): GeneratorContext {
  return {
    citizens: [citizen()], programs: [], dtSeconds: 86_400,
    durationSeconds: 3 * 86_400, random: seq([]), config: GENERATOR_CONFIG, ...over,
  };
}

describe("randomBirth", () => {
  it("emits a birth-registration event with the mother's national id and family name", () => {
    const mother = citizen({ national_id: "MOM", family_name: "Curie", sex: "female" });
    // day 0: count 0 (->1 birth); mother idx 0; offset 0; sex roll 0.9 (female);
    // given idx 0; (no male adults -> no father draw); place idx 0.
    const random = seq([0, 0, 0, 0.9, 0, 0]);
    const events = randomBirth.generate(ctx({ citizens: [mother], random }));
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.targetKey).toBe("birth-registration");
    const p = e.payload as any;
    expect(p.mother_national_id).toBe("MOM");
    expect(p.family_name).toBe("Curie");
    expect(p.date_of_birth).toBe("2025-01-01");
    expect(p.sex).toBe("female");
    expect(typeof p.given_name).toBe("string");
    expect(typeof p.place_of_birth).toBe("string");
    expect(p.father_national_id).toBeUndefined();
  });

  it("includes father_national_id when an adult male exists", () => {
    const mother = citizen({ national_id: "MOM", sex: "female" });
    const father = citizen({ id: "c2", national_id: "DAD", sex: "male" });
    // count 0; mother idx 0; offset 0; sex roll 0 (male); given idx 0; father idx 0; place idx 0.
    const random = seq([0, 0, 0, 0, 0, 0, 0]);
    const events = randomBirth.generate(ctx({ citizens: [mother, father], random }));
    expect((events[0].payload as any).father_national_id).toBe("DAD");
  });

  it("emits nothing when there is no eligible mother", () => {
    const father = citizen({ id: "c2", national_id: "DAD", sex: "male" });
    const events = randomBirth.generate(ctx({ citizens: [father], random: () => 0 }));
    expect(events).toHaveLength(0);
  });

  it("emits nothing when the per-day count stays at zero", () => {
    const events = randomBirth.generate(ctx({ random: () => 1 }));
    expect(events).toHaveLength(0);
  });

  it("scales the daily count by a part-day run and schedules inside it", () => {
    const mother = citizen({ national_id: "MOM", sex: "female" });
    // 6 hours = a quarter day: count bump 0 (->1 birth); mother idx 0;
    // offset 0.5 of the 6-hour step; sex roll 0.9 (female); given idx 0; place idx 0.
    const random = seq([0, 0, 0.5, 0.9, 0, 0]);
    const events = randomBirth.generate(
      ctx({ citizens: [mother], durationSeconds: 21_600, random }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].scheduledSimSeconds).toBe(Math.floor(0.5 * 21_600));
  });

  it("emits nothing on a part-day run when the count roll misses the scaled rate", () => {
    // A quarter-day expects a quarter of the daily count, so a roll that would
    // have cleared the full daily remainder no longer does.
    const rate = GENERATOR_CONFIG.birth.dailyRatePerPopulation;
    const random = seq([rate - 0.0001]);
    const events = randomBirth.generate(
      ctx({ durationSeconds: 21_600, random }),
    );
    expect(events).toHaveLength(0);
  });
});
