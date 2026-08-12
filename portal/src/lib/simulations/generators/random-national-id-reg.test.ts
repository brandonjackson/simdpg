import { describe, it, expect } from "vitest";
import type { Citizen } from "@simdpg/api-clients";
import type { GeneratorContext } from "./types";
import { randomNationalIdReg } from "./random-national-id-reg";
import { GENERATOR_CONFIG } from "./config";

const NATIONAL_ID_DAILY_PROB = GENERATOR_CONFIG.nationalId.dailyProbPerCitizen;

function citizen(over: Partial<Citizen> = {}): Citizen {
  return {
    id: "c1",
    national_id: "NID-1",
    given_name: "Ada",
    family_name: "Lovelace",
    date_of_birth: "1990-01-01",
    sex: "female",
    email: "ada@example.test",
    phone_number: "+100",
    date_of_death: null,
    status: "alive",
    created_at: "2020-01-01",
    updated_at: "2020-01-01",
    addresses: [
      {
        id: "a1",
        citizen_id: "c1",
        type: "residential",
        line_1: "1 Test St",
        line_2: null,
        city: "Testville",
        postal_code: "00000",
        from_date: "2020-01-01",
        to_date: null,
      },
    ],
    ...over,
  };
}

/** Feeds a fixed sequence of numbers to `random`, then 1.0 forever. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 1);
}

function ctx(over: Partial<GeneratorContext> = {}): GeneratorContext {
  return {
    citizens: [citizen()],
    programs: [],
    dtSeconds: 86_400,
    durationSeconds: 10 * 86_400,
    random: seq([]),
    config: GENERATOR_CONFIG,
    ...over,
  };
}

describe("randomNationalIdReg", () => {
  it("emits an event when a daily roll lands below the probability", () => {
    // day 0 roll below threshold -> hit; second draw picks the intra-day offset.
    const random = seq([NATIONAL_ID_DAILY_PROB - 0.0001, 0.5]);
    const events = randomNationalIdReg.generate(ctx({ random }));
    expect(events).toHaveLength(1);
    expect(events[0].targetKey).toBe("national-id");
    expect(events[0].scheduledSimSeconds).toBe(0 * 86_400 + Math.floor(0.5 * 86_400));
  });

  it("emits nothing when every roll is above the probability", () => {
    const events = randomNationalIdReg.generate(ctx({ random: () => 1 }));
    expect(events).toHaveLength(0);
  });

  it("registers each citizen at most once (breaks after first hit)", () => {
    // Two straight sub-threshold rolls; if it did not break, day 1 would hit too.
    const random = seq([0, 0.5, 0, 0.5]);
    const events = randomNationalIdReg.generate(ctx({ random }));
    expect(events).toHaveLength(1);
  });

  it("builds the national-id payload from the citizen, with address fields", () => {
    const random = seq([0, 0]);
    const events = randomNationalIdReg.generate(ctx({ random }));
    expect(events[0].payload).toEqual({
      given_name: "Ada",
      family_name: "Lovelace",
      date_of_birth: "1990-01-01",
      sex: "female",
      address_line_1: "1 Test St",
      city: "Testville",
      postal_code: "00000",
      email: "ada@example.test",
      phone_number: "+100",
    });
  });

  it("falls back to empty strings when the citizen has no addresses", () => {
    const random = seq([0, 0]);
    const events = randomNationalIdReg.generate(
      ctx({ citizens: [citizen({ addresses: undefined })], random }),
    );
    expect(events[0].payload).toMatchObject({
      address_line_1: "",
      city: "",
      postal_code: "",
    });
  });

  it("still registers on a sub-day run, scaling the probability by the part-day", () => {
    // One hour = 1/24 of a day, so the roll must clear dailyProb/24, and the
    // offset falls inside that hour rather than a whole day.
    const random = seq([NATIONAL_ID_DAILY_PROB / 24 - 0.0001, 0.5]);
    const events = randomNationalIdReg.generate(
      ctx({ durationSeconds: 3600, random }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].scheduledSimSeconds).toBe(Math.floor(0.5 * 3600));
  });

  it("does not register on a sub-day run when the roll clears the full daily probability but not the scaled one", () => {
    const random = seq([NATIONAL_ID_DAILY_PROB - 0.0001, 0.5]);
    const events = randomNationalIdReg.generate(
      ctx({ durationSeconds: 3600, random }),
    );
    expect(events).toHaveLength(0);
  });

  it("emits nothing when the duration is zero", () => {
    const events = randomNationalIdReg.generate(
      ctx({ durationSeconds: 0, random: () => 0 }),
    );
    expect(events).toHaveLength(0);
  });
});
