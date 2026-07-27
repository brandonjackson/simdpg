import { describe, it, expect, vi, afterEach } from "vitest";
import {
  handleDeliveryJob,
  concurrencyFromEnv,
  DEFAULT_WORKER_CONCURRENCY,
  type HandlerDeps,
} from "./delivery-worker.js";
import type { DeliveryJob } from "./delivery-queue.js";
import type { SimulationEvent } from "./events.js";
import type { RunCounters } from "./redis.js";

function ev(over: Partial<SimulationEvent> = {}): SimulationEvent {
  return {
    id: "e",
    scheduledMicros: 0,
    targetKey: "national-id",
    targetUrl: "http://hook",
    payload: { a: 1 },
    ...over,
  };
}

function job(over: Partial<SimulationEvent> = {}, simulationId = "sim-1"): DeliveryJob {
  return { simulationId, event: ev(over) };
}

/** In-memory stand-in for Redis: records INCRs, answers EXISTS from a set. */
function fakeCounters(stoppedRuns: string[] = []) {
  const incrs: string[] = [];
  const stopped = new Set(stoppedRuns.map((id) => `sim:run:${id}:stopped`));
  const counters: RunCounters = {
    incr: async (key) => { incrs.push(key); return incrs.filter((k) => k === key).length; },
    exists: async (...keys) => keys.filter((k) => stopped.has(k)).length,
  };
  return { counters, incrs };
}

function deps(over: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    fetch: vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch,
    counters: fakeCounters().counters,
    ...over,
  };
}

describe("handleDeliveryJob", () => {
  it("POSTs the event and increments the delivered counter", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 202 })) as unknown as typeof fetch;
    const { counters, incrs } = fakeCounters();

    const outcome = await handleDeliveryJob(job({ targetUrl: "http://hook", payload: { x: 1 } }), deps({ fetch, counters }));

    expect(outcome).toBe("delivered");
    expect(fetch).toHaveBeenCalledWith(
      "http://hook",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ x: 1 }) }),
    );
    expect(incrs).toEqual(["sim:run:sim-1:delivered"]);
  });

  it("increments the skipped counter without POSTing when no webhook is registered", async () => {
    const fetch = vi.fn() as unknown as typeof fetch;
    const { counters, incrs } = fakeCounters();

    const outcome = await handleDeliveryJob(job({ targetUrl: null }), deps({ fetch, counters }));

    expect(outcome).toBe("skipped");
    expect(fetch).not.toHaveBeenCalled();
    expect(incrs).toEqual(["sim:run:sim-1:skipped"]);
  });

  it("increments the failed counter on a non-2xx response", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    const { counters, incrs } = fakeCounters();

    const outcome = await handleDeliveryJob(job(), deps({ fetch, counters }));

    expect(outcome).toBe("failed");
    expect(incrs).toEqual(["sim:run:sim-1:failed"]);
  });

  it("increments the failed counter when the POST throws", async () => {
    const fetch = vi.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch;
    const { counters, incrs } = fakeCounters();

    const outcome = await handleDeliveryJob(job(), deps({ fetch, counters }));

    expect(outcome).toBe("failed");
    expect(incrs).toEqual(["sim:run:sim-1:failed"]);
  });

  it("counts against the job's own run, so one pool can serve several runs", async () => {
    const { counters, incrs } = fakeCounters();
    const d = deps({ counters });

    await handleDeliveryJob(job({}, "run-a"), d);
    await handleDeliveryJob(job({}, "run-b"), d);

    expect(incrs).toEqual(["sim:run:run-a:delivered", "sim:run:run-b:delivered"]);
  });

  it("skips a queued job whose run has been stopped, without POSTing", async () => {
    const fetch = vi.fn() as unknown as typeof fetch;
    const { counters, incrs } = fakeCounters(["sim-1"]);

    const outcome = await handleDeliveryJob(job(), deps({ fetch, counters }));

    expect(outcome).toBe("skipped");
    expect(fetch).not.toHaveBeenCalled();
    expect(incrs).toEqual(["sim:run:sim-1:skipped"]);
  });

  it("still delivers for a run that has not been stopped", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    const { counters } = fakeCounters(["some-other-run"]);

    expect(await handleDeliveryJob(job(), deps({ fetch, counters }))).toBe("delivered");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not fail the job when the counter INCR fails", async () => {
    // The event is already POSTed by then, so throwing would let BullMQ retry
    // and deliver it twice.
    const counters: RunCounters = {
      incr: async () => { throw new Error("redis down"); },
      exists: async () => 0,
    };

    expect(await handleDeliveryJob(job(), deps({ counters }))).toBe("delivered");
  });

  it("aborts and fails a POST that hangs past timeoutMs", async () => {
    vi.useFakeTimers();
    const fetch = ((_url: string, opts: { signal?: AbortSignal }) =>
      new Promise<Response>((_, reject) => {
        opts.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const { counters, incrs } = fakeCounters();

    const outcome = handleDeliveryJob(job(), deps({ fetch, counters, timeoutMs: 1000 }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(await outcome).toBe("failed");
    expect(incrs).toEqual(["sim:run:sim-1:failed"]);
    vi.useRealTimers();
  });
});

describe("concurrencyFromEnv", () => {
  afterEach(() => { delete process.env.SIM_WORKER_CONCURRENCY; });

  it("defaults when unset", () => {
    expect(concurrencyFromEnv()).toBe(DEFAULT_WORKER_CONCURRENCY);
  });

  it("reads SIM_WORKER_CONCURRENCY", () => {
    process.env.SIM_WORKER_CONCURRENCY = "50";
    expect(concurrencyFromEnv()).toBe(50);
  });

  it("falls back to the default on a non-positive or unparseable value", () => {
    for (const raw of ["0", "-5", "banana", ""]) {
      process.env.SIM_WORKER_CONCURRENCY = raw;
      expect(concurrencyFromEnv()).toBe(DEFAULT_WORKER_CONCURRENCY);
    }
  });
});
