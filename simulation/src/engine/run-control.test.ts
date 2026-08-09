import { describe, it, expect, afterEach, vi } from "vitest";
import type { Redis } from "ioredis";
import { setRedisForTesting } from "./redis.js";
import {
  createMemoryRunControl,
  createRunControl,
  createStopGate,
  stopKey,
  STOP_FLAG_TTL_SECONDS,
  type RunControl,
} from "./run-control.js";

interface FakeRedis {
  store: Map<string, string>;
  calls: string[][];
  fail: Error | null;
  hang: boolean;
  client: Redis;
}

function fakeRedis(): FakeRedis {
  const store = new Map<string, string>();
  const calls: string[][] = [];
  const fake: FakeRedis = {
    store,
    calls,
    fail: null,
    hang: false,
    client: null as unknown as Redis,
  };
  const guard = async (): Promise<void> => {
    if (fake.hang) await new Promise<never>(() => {});
    if (fake.fail) throw fake.fail;
  };
  fake.client = {
    async set(key: string, value: string, mode: string, ttl: number) {
      calls.push(["set", key, value, mode, String(ttl)]);
      await guard();
      store.set(key, value);
      return "OK";
    },
    async get(key: string) {
      calls.push(["get", key]);
      await guard();
      return store.get(key) ?? null;
    },
    async del(key: string) {
      calls.push(["del", key]);
      await guard();
      return store.delete(key) ? 1 : 0;
    },
  } as unknown as Redis;
  return fake;
}

afterEach(() => {
  setRedisForTesting(null);
  vi.useRealTimers();
});

describe("stopKey", () => {
  it("namespaces the flag per run", () => {
    expect(stopKey("abc")).toBe("sim:run:abc:stopped");
  });
});

describe("createRunControl", () => {
  it("falls back to a process-local flag when no broker is configured", async () => {
    setRedisForTesting(null);
    const control = createRunControl();

    expect(await control.isStopped("s1")).toBe(false);
    await control.markStopped("s1");
    expect(await control.isStopped("s1")).toBe(true);
    await control.clearStopped("s1");
    expect(await control.isStopped("s1")).toBe(false);
  });

  it("writes the stop flag to Redis with a TTL so queued jobs still see it", async () => {
    const fake = fakeRedis();
    setRedisForTesting(fake.client);
    const control = createRunControl();

    await control.markStopped("s1");

    expect(fake.store.get("sim:run:s1:stopped")).toBe("1");
    expect(fake.calls).toContainEqual([
      "set", "sim:run:s1:stopped", "1", "EX", String(STOP_FLAG_TTL_SECONDS),
    ]);
  });

  it("reads and clears the flag through Redis", async () => {
    const fake = fakeRedis();
    setRedisForTesting(fake.client);
    const control = createRunControl();

    expect(await control.isStopped("s1")).toBe(false);
    await control.markStopped("s1");
    expect(await control.isStopped("s1")).toBe(true);
    await control.clearStopped("s1");
    expect(await control.isStopped("s1")).toBe(false);
  });

  it("never throws when the broker rejects, and lets the job through", async () => {
    const fake = fakeRedis();
    fake.fail = new Error("connection refused");
    setRedisForTesting(fake.client);
    const control = createRunControl();

    await expect(control.markStopped("s1")).resolves.toBeUndefined();
    await expect(control.clearStopped("s1")).resolves.toBeUndefined();
    // Fails open: a blip must not cancel a healthy run.
    expect(await control.isStopped("s1")).toBe(false);
  });

  it("gives up on a stalled broker instead of wedging the caller", async () => {
    vi.useFakeTimers();
    const fake = fakeRedis();
    fake.hang = true;
    setRedisForTesting(fake.client);
    const control = createRunControl();

    const check = control.isStopped("s1");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await check).toBe(false);
  });
});

/** Counts lookups so cache behaviour is observable. */
function countingControl(stopped: Set<string>): RunControl & { lookups: number } {
  const inner = {
    lookups: 0,
    async markStopped(id: string) { stopped.add(id); },
    async isStopped(id: string) { inner.lookups += 1; return stopped.has(id); },
    async clearStopped(id: string) { stopped.delete(id); },
  };
  return inner;
}

describe("createStopGate", () => {
  it("reports a stopped run so the worker can drop the job", async () => {
    const stopped = new Set<string>(["s1"]);
    const gate = createStopGate({ control: countingControl(stopped) });

    expect(await gate.isStopped("s1")).toBe(true);
    expect(await gate.isStopped("s2")).toBe(false);
  });

  it("serves repeat checks from cache, then re-checks once the window lapses", async () => {
    const stopped = new Set<string>();
    const control = countingControl(stopped);
    let now = 1_000;
    const gate = createStopGate({ control, cacheMs: 250, now: () => now });

    expect(await gate.isStopped("s1")).toBe(false);
    expect(await gate.isStopped("s1")).toBe(false);
    expect(control.lookups).toBe(1);

    now += 251;
    stopped.add("s1");
    expect(await gate.isStopped("s1")).toBe(true);
    expect(control.lookups).toBe(2);
  });

  it("stops asking once a run is stopped — the flag is one-way", async () => {
    const control = countingControl(new Set(["s1"]));
    const gate = createStopGate({ control });

    expect(await gate.isStopped("s1")).toBe(true);
    expect(await gate.isStopped("s1")).toBe(true);
    expect(control.lookups).toBe(1);
  });

  it("shares one lookup across concurrent jobs for the same run", async () => {
    const control = countingControl(new Set());
    const gate = createStopGate({ control });

    const answers = await Promise.all([
      gate.isStopped("s1"),
      gate.isStopped("s1"),
      gate.isStopped("s1"),
    ]);

    expect(answers).toEqual([false, false, false]);
    expect(control.lookups).toBe(1);
  });

  it("re-checks after invalidate, so a re-run of the same id is not stuck stopped", async () => {
    const stopped = new Set<string>(["s1"]);
    const control = countingControl(stopped);
    const gate = createStopGate({ control });

    expect(await gate.isStopped("s1")).toBe(true);
    stopped.delete("s1");
    gate.invalidate("s1");
    expect(await gate.isStopped("s1")).toBe(false);
    expect(control.lookups).toBe(2);
  });

  it("picks up a stop raised after it has already answered", async () => {
    const control = createMemoryRunControl();
    const gate = createStopGate({ control, cacheMs: 0 });

    expect(await gate.isStopped("s1")).toBe(false);
    await control.markStopped("s1");
    expect(await gate.isStopped("s1")).toBe(true);
  });
});
