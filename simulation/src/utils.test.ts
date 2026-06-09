import { describe, it, expect, vi, afterEach } from "vitest";
import {
  randomChoice,
  randomInt,
  weightedChoice,
  ageFromDob,
  formatDate,
} from "./utils.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("randomChoice", () => {
  it("returns an element from the array", () => {
    const arr = ["a", "b", "c"];
    expect(arr).toContain(randomChoice(arr));
  });

  it("returns the only element for a single-item array", () => {
    expect(randomChoice([42])).toBe(42);
  });

  it("throws on an empty array", () => {
    expect(() => randomChoice([])).toThrow(/empty array/);
  });
});

describe("randomInt", () => {
  it("stays within the inclusive bounds across many draws", () => {
    for (let i = 0; i < 1000; i++) {
      const n = randomInt(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("returns the bound when min === max", () => {
    expect(randomInt(5, 5)).toBe(5);
  });

  it("can return both endpoints", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(randomInt(2, 9)).toBe(2);
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(randomInt(2, 9)).toBe(9);
  });
});

describe("weightedChoice", () => {
  it("throws when items and weights differ in length", () => {
    expect(() => weightedChoice(["a", "b"], [1])).toThrow(/same length/);
  });

  it("never selects a zero-weight item", () => {
    const counts = { a: 0, b: 0 } as Record<string, number>;
    for (let i = 0; i < 500; i++) {
      counts[weightedChoice(["a", "b"], [1, 0])]++;
    }
    expect(counts.b).toBe(0);
    expect(counts.a).toBe(500);
  });

  it("selects the bucket the random draw falls into", () => {
    // total = 10; r = 0.65 * 10 = 6.5 -> first bucket (weight 7) wins
    vi.spyOn(Math, "random").mockReturnValue(0.65);
    expect(weightedChoice(["x", "y"], [7, 3])).toBe("x");
    // r = 0.8 * 10 = 8 -> spills past first bucket into second
    vi.spyOn(Math, "random").mockReturnValue(0.8);
    expect(weightedChoice(["x", "y"], [7, 3])).toBe("y");
  });
});

describe("ageFromDob", () => {
  it("computes age as of a reference date", () => {
    expect(ageFromDob("2000-01-01", new Date("2026-01-01"))).toBe(26);
  });

  it("does not count a birthday that has not occurred yet", () => {
    expect(ageFromDob("2000-12-31", new Date("2026-06-09"))).toBe(25);
  });

  it("counts a birthday that lands exactly on the reference date", () => {
    expect(ageFromDob("2000-06-09", new Date("2026-06-09"))).toBe(26);
  });
});

describe("formatDate", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(formatDate(new Date("2026-06-09T13:45:00Z"))).toBe("2026-06-09");
  });
});
