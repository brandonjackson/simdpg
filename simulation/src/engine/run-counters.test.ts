import { describe, it, expect, vi } from "vitest";
import { counterKey, redisCountsSource, runKeys, stopFlagKey } from "./run-counters.js";

describe("counter keys", () => {
  it("namespaces every key a run owns under sim:run:<id>", () => {
    expect(counterKey("s1", "delivered")).toBe("sim:run:s1:delivered");
    expect(stopFlagKey("s1")).toBe("sim:run:s1:stopped");
    expect(runKeys("s1")).toEqual([
      "sim:run:s1:delivered",
      "sim:run:s1:skipped",
      "sim:run:s1:failed",
      "sim:run:s1:stopped",
    ]);
  });
});

describe("redisCountsSource", () => {
  it("reads all three counters in one round trip", async () => {
    const mget = vi.fn(async () => ["3", "1", "2"]);
    const source = redisCountsSource({ mget }, "s1");

    expect(await source()).toEqual({ delivered: 3, skipped: 1, failed: 2 });
    expect(mget).toHaveBeenCalledTimes(1);
    expect(mget).toHaveBeenCalledWith(
      "sim:run:s1:delivered",
      "sim:run:s1:skipped",
      "sim:run:s1:failed",
    );
  });

  it("counts an outcome no worker has recorded yet as zero", async () => {
    // A run whose workers have only ever delivered has no skipped/failed key at
    // all; an absent counter is zero, not a hole in the progress numbers.
    const source = redisCountsSource({ mget: async () => ["7", null, undefined] }, "s1");
    expect(await source()).toEqual({ delivered: 7, skipped: 0, failed: 0 });
  });
});
