import { describe, it, expect, afterEach } from "vitest";
import { redisUrlFromEnv, runCounterKey, runStoppedKey, DEFAULT_REDIS_URL } from "./redis.js";

describe("redisUrlFromEnv", () => {
  afterEach(() => { delete process.env.REDIS_URL; });

  it("defaults to a local Redis when unset", () => {
    expect(redisUrlFromEnv()).toBe(DEFAULT_REDIS_URL);
  });

  it("reads REDIS_URL", () => {
    process.env.REDIS_URL = "redis://cache:6379";
    expect(redisUrlFromEnv()).toBe("redis://cache:6379");
  });

  it("treats a blank value as unset", () => {
    process.env.REDIS_URL = "   ";
    expect(redisUrlFromEnv()).toBe(DEFAULT_REDIS_URL);
  });
});

describe("run keys", () => {
  it("namespaces counters per run and outcome", () => {
    expect(runCounterKey("abc", "delivered")).toBe("sim:run:abc:delivered");
    expect(runCounterKey("abc", "skipped")).toBe("sim:run:abc:skipped");
    expect(runCounterKey("abc", "failed")).toBe("sim:run:abc:failed");
  });

  it("namespaces the stop flag per run", () => {
    expect(runStoppedKey("abc")).toBe("sim:run:abc:stopped");
  });
});
