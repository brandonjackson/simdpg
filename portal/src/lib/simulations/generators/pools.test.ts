import { describe, it, expect } from "vitest";
import {
  daySteps,
  isAdult,
  pick,
  drawCount,
  sampleWithoutReplacement,
  simDayToDate,
  cityNames,
  CAUSES_OF_DEATH,
} from "./pools";

/** Feeds a fixed sequence to `random`, then 0 forever. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
}

describe("pools helpers", () => {
  it("isAdult: true for an old birth year, false for a recent one", () => {
    expect(isAdult("1990-01-01")).toBe(true);
    expect(isAdult("2020-01-01")).toBe(false);
  });

  it("pick: index = floor(random * length)", () => {
    const arr = ["a", "b", "c", "d"];
    expect(pick(arr, () => 0)).toBe("a");
    expect(pick(arr, () => 0.5)).toBe("c");
  });

  it("drawCount: floor plus Bernoulli on remainder", () => {
    expect(drawCount(2.4, () => 0.9)).toBe(2); // 0.9 >= 0.4 -> no bump
    expect(drawCount(2.4, () => 0.1)).toBe(3); // 0.1 < 0.4 -> bump
    expect(drawCount(0.00001, () => 0)).toBe(1); // 0 < remainder -> 1
  });

  it("sampleWithoutReplacement: distinct, capped at array length", () => {
    const out = sampleWithoutReplacement(["a", "b", "c"], 2, seq([0, 0]));
    expect(out).toHaveLength(2);
    expect(new Set(out).size).toBe(2);
    expect(sampleWithoutReplacement(["a"], 5, seq([0]))).toHaveLength(1);
  });

  it("simDayToDate: day 0 is the epoch, day 1 the next day", () => {
    expect(simDayToDate(0)).toBe("2025-01-01");
    expect(simDayToDate(1)).toBe("2025-01-02");
  });

  it("exposes non-empty name/cause pools", () => {
    expect(cityNames.length).toBeGreaterThan(0);
    expect(CAUSES_OF_DEATH.length).toBeGreaterThan(0);
  });
});

describe("daySteps", () => {
  it("whole-day durations are whole steps", () => {
    expect(daySteps(3 * 86_400, 86_400)).toEqual([
      { day: 0, fraction: 1, stepSeconds: 86_400 },
      { day: 1, fraction: 1, stepSeconds: 86_400 },
      { day: 2, fraction: 1, stepSeconds: 86_400 },
    ]);
  });

  it("keeps a sub-day duration as one partial step instead of dropping it", () => {
    expect(daySteps(3_600, 86_400)).toEqual([
      { day: 0, fraction: 1 / 24, stepSeconds: 3_600 },
    ]);
  });

  it("keeps the trailing part-day after the whole days", () => {
    expect(daySteps(86_400 + 21_600, 86_400)).toEqual([
      { day: 0, fraction: 1, stepSeconds: 86_400 },
      { day: 1, fraction: 0.25, stepSeconds: 21_600 },
    ]);
  });

  it("returns no steps for a non-positive duration or step size", () => {
    expect(daySteps(0, 86_400)).toEqual([]);
    expect(daySteps(-1, 86_400)).toEqual([]);
    expect(daySteps(86_400, 0)).toEqual([]);
  });
});
