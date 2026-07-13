import { describe, it, expect } from "vitest";
import type { Citizen } from "@simdpg/api-clients";
import type { GeneratorContext } from "./types";
import { randomMarriage } from "./random-marriage";
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
    citizens: [], programs: [], dtSeconds: 86_400,
    durationSeconds: 3 * 86_400, random: seq([]), config: GENERATOR_CONFIG, ...over,
  };
}

describe("randomMarriage", () => {
  it("emits a marriage-registration event pairing two distinct adults", () => {
    const a = citizen({ id: "a", national_id: "A" });
    const b = citizen({ id: "b", national_id: "B" });
    // count 0 (->1 marriage); two shuffle draws 0,0; offset 0; place 0.
    const random = seq([0, 0, 0, 0, 0]);
    const events = randomMarriage.generate(ctx({ citizens: [a, b], random }));
    expect(events).toHaveLength(1);
    const p = events[0].payload as any;
    expect(events[0].targetKey).toBe("marriage-registration");
    expect(p.spouse_1_national_id).not.toBe(p.spouse_2_national_id);
    expect(new Set([p.spouse_1_national_id, p.spouse_2_national_id])).toEqual(new Set(["A", "B"]));
    expect(p.date_of_marriage).toBe("2025-01-01");
    expect(typeof p.place_of_marriage).toBe("string");
  });

  it("emits nothing when fewer than two adults exist", () => {
    const only = citizen({ national_id: "A" });
    const events = randomMarriage.generate(ctx({ citizens: [only], random: () => 0 }));
    expect(events).toHaveLength(0);
  });

  it("emits nothing when the per-day count stays at zero", () => {
    const a = citizen({ id: "a", national_id: "A" });
    const b = citizen({ id: "b", national_id: "B" });
    const events = randomMarriage.generate(ctx({ citizens: [a, b], random: () => 1 }));
    expect(events).toHaveLength(0);
  });

  it("emits nothing when the marriage rate in config is zero", () => {
    const a = citizen({ id: "a", national_id: "A" });
    const b = citizen({ id: "b", national_id: "B" });
    const zero = { ...GENERATOR_CONFIG, marriage: { dailyRatePerPopulation: 0 } };
    const events = randomMarriage.generate(ctx({ citizens: [a, b], random: () => 0, config: zero }));
    expect(events).toHaveLength(0);
  });
});
