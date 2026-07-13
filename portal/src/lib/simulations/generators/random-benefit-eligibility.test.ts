import { describe, it, expect } from "vitest";
import type { Citizen, Program } from "@simdpg/api-clients";
import type { GeneratorContext } from "./types";
import { randomBenefitEligibility } from "./random-benefit-eligibility";
import { GENERATOR_CONFIG } from "./config";

function citizen(over: Partial<Citizen> = {}): Citizen {
  return {
    id: "c1", national_id: "NID-1", given_name: "Ada", family_name: "Lovelace",
    date_of_birth: "1990-01-01", sex: "female", email: null, phone_number: null,
    date_of_death: null, status: "alive", created_at: "2020-01-01",
    updated_at: "2020-01-01", addresses: [], ...over,
  };
}

const program: Program = {
  id: "prog-1", name: "Child Benefit", description: "", eligibility_rules: {},
  payment_amount: 150, payment_frequency: "monthly", status: "active",
  created_at: "2020-01-01", updated_at: "2020-01-01",
};

function seq(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 1);
}

function ctx(over: Partial<GeneratorContext> = {}): GeneratorContext {
  return {
    citizens: [citizen()], programs: [program], dtSeconds: 86_400,
    durationSeconds: 3 * 86_400, random: seq([]), ...over,
  };
}

const { toStep2, toStep3 } = GENERATOR_CONFIG.benefits.chainProbabilities;

describe("randomBenefitEligibility", () => {
  it("emits step 1 only when the step-2 roll fails", () => {
    // count 0 (->1); citizen idx 0; offset 0; program idx 0; step2 roll 0.99 (fail).
    const random = seq([0, 0, 0, 0, 0.99]);
    const events = randomBenefitEligibility.generate(ctx({ random }));
    expect(events.map((e) => e.targetKey)).toEqual(["benefit-eligibility-lookup"]);
    expect(events[0].payload).toEqual({ national_id: "NID-1" });
  });

  it("emits steps 1 and 2 when step-2 passes but step-3 fails", () => {
    // ... program idx 0; step2 roll 0 (pass); step3 roll 0.99 (fail).
    const random = seq([0, 0, 0, 0, 0, 0.99]);
    const events = randomBenefitEligibility.generate(ctx({ random }));
    expect(events.map((e) => e.targetKey)).toEqual([
      "benefit-eligibility-lookup",
      "benefit-eligibility-check",
    ]);
    const check = events[1].payload as any;
    expect(check).toEqual({ citizen_id: "c1", program_id: "prog-1" });
    expect(events[1].scheduledSimSeconds).toBe(
      events[0].scheduledSimSeconds + GENERATOR_CONFIG.benefits.stepDelaySeconds,
    );
  });

  it("emits all three steps when both chain rolls pass", () => {
    const random = seq([0, 0, 0, 0, 0, 0]);
    const events = randomBenefitEligibility.generate(ctx({ random }));
    expect(events.map((e) => e.targetKey)).toEqual([
      "benefit-eligibility-lookup",
      "benefit-eligibility-check",
      "benefit-eligibility-enrol",
    ]);
    expect(events[2].scheduledSimSeconds).toBe(
      events[0].scheduledSimSeconds + 2 * GENERATOR_CONFIG.benefits.stepDelaySeconds,
    );
  });

  it("emits step 1 only when no programmes are available", () => {
    const random = seq([0, 0, 0]);
    const events = randomBenefitEligibility.generate(ctx({ programs: [], random }));
    expect(events.map((e) => e.targetKey)).toEqual(["benefit-eligibility-lookup"]);
  });

  it("emits nothing when the per-day count stays at zero", () => {
    const events = randomBenefitEligibility.generate(ctx({ random: () => 1 }));
    // toStep2/toStep3 unused here; referenced to keep the config wiring honest.
    expect(toStep2).toBeGreaterThan(0);
    expect(toStep3).toBeGreaterThan(0);
    expect(events).toHaveLength(0);
  });
});
