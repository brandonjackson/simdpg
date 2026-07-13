import { describe, expect, it } from "vitest";
import { parseStats } from "./stats";

describe("parseStats", () => {
  it("returns null when stats are absent", () => {
    expect(parseStats(undefined)).toBeNull();
  });

  it("returns null for an empty stats object", () => {
    expect(parseStats({})).toBeNull();
  });

  it("reads delivered/skipped/failed/total counts", () => {
    expect(parseStats({ delivered: 8, skipped: 1, failed: 2, total: 11 })).toEqual({
      delivered: 8,
      skipped: 1,
      failed: 2,
      total: 11,
    });
  });

  it("defaults missing or non-numeric counts to zero", () => {
    expect(parseStats({ delivered: 5, failed: "oops" })).toEqual({
      delivered: 5,
      skipped: 0,
      failed: 0,
      total: 0,
    });
  });

  it("surfaces a string error message", () => {
    const parsed = parseStats({ total: 0, error: "worker crashed" });
    expect(parsed?.error).toBe("worker crashed");
  });

  it("omits a non-string error", () => {
    const parsed = parseStats({ delivered: 3, error: 123 });
    expect(parsed?.error).toBeUndefined();
  });
});
