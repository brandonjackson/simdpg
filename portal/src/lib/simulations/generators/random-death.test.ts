import { describe, it, expect } from "vitest";
import type { Citizen } from "@simdpg/api-clients";
import type { GeneratorContext } from "./types";
import { randomDeath } from "./random-death";
import { GENERATOR_CONFIG } from "./config";

function citizen(over: Partial<Citizen> = {}): Citizen {
  return {
    id: "c1", national_id: "NID-1", given_name: "Ada", family_name: "Lovelace",
    date_of_birth: "1950-01-01", sex: "female", email: null, phone_number: null,
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
    durationSeconds: 5 * 86_400, random: seq([]), config: GENERATOR_CONFIG, ...over,
  };
}

describe("randomDeath", () => {
  it("emits a lookup+preview pair for a death, staggered by stepDelaySeconds", () => {
    // day 0: count draw 0 (<rate -> 1 death); shuffle draw 0; offset 0; place 0; cause 0.
    const random = seq([0, 0, 0, 0, 0]);
    const events = randomDeath.generate(ctx({ random }));
    expect(events).toHaveLength(2);
    expect(events[0].targetKey).toBe("death-registration-lookup");
    expect(events[0].payload).toEqual({ national_id: "NID-1" });
    expect(events[1].targetKey).toBe("death-registration-preview");
    expect(events[1].scheduledSimSeconds).toBe(
      events[0].scheduledSimSeconds + GENERATOR_CONFIG.death.stepDelaySeconds,
    );
  });

  it("preview payload carries citizen_data and userInput fields", () => {
    const random = seq([0, 0, 0, 0, 0]);
    const events = randomDeath.generate(ctx({ random }));
    const preview = events[1].payload as any;
    expect(preview.citizen_data.national_id).toBe("NID-1");
    expect(preview.userInput.dateOfDeath).toBe("2025-01-01");
    expect(typeof preview.userInput.placeOfDeath).toBe("string");
    expect(typeof preview.userInput.causeOfDeath).toBe("string");
  });

  it("never emits the confirm step", () => {
    const random = seq([0, 0, 0, 0, 0]);
    const keys = randomDeath.generate(ctx({ random })).map((e) => e.targetKey);
    expect(keys).not.toContain("death-registration-confirm");
  });

  it("emits nothing when the per-day count draw stays at zero", () => {
    // Every day: count draw 1 (>= remainder -> 0 deaths).
    const events = randomDeath.generate(ctx({ random: () => 1 }));
    expect(events).toHaveLength(0);
  });

  it("kills each citizen at most once (draining pool)", () => {
    // 2 citizens, 5 days. Force a death every single day; expect exactly 2
    // deaths total (4 events), because the pool drains to empty.
    const two = [citizen({ id: "c1", national_id: "N1" }), citizen({ id: "c2", national_id: "N2" })];
    const events = randomDeath.generate(ctx({ citizens: two, random: () => 0 }));
    const lookups = events.filter((e) => e.targetKey === "death-registration-lookup");
    expect(lookups).toHaveLength(2);
    const ids = new Set(lookups.map((e) => (e.payload as any).national_id));
    expect(ids).toEqual(new Set(["N1", "N2"]));
  });
});
