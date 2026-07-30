import { describe, it, expect, vi } from "vitest";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { BEHAVIOR_OFF, behaviorPreset, parseBehavior } from "./behavior.js";
import {
  BehaviorController,
  DEFAULT_BEHAVIOR_SKIP_PREFIXES,
  behaviorMiddleware,
  createBehavior,
} from "./behavior-runtime.js";

/** A clock the tests advance by hand. */
function fakeClock(startMs = 1_000_000) {
  let ms = startMs;
  return {
    now: () => ms,
    advance: (by: number) => {
      ms += by;
    },
  };
}

interface FakeResponse {
  res: Response;
  statusCode: number | null;
  body: unknown;
  headers: Record<string, string>;
}

function fakeResponse(): FakeResponse {
  const state: FakeResponse = {
    statusCode: null,
    body: undefined,
    headers: {},
    res: null as unknown as Response,
  };
  state.res = {
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
      return state.res;
    },
    status(code: number) {
      state.statusCode = code;
      return state.res;
    },
    json(payload: unknown) {
      state.body = payload;
      return state.res;
    },
  } as unknown as Response;
  return state;
}

/** Drive the middleware once and report what happened. */
async function call(
  middleware: RequestHandler,
  path = "/citizens",
): Promise<FakeResponse & { nexted: boolean }> {
  const response = fakeResponse();
  const next = vi.fn();
  middleware(
    { path } as Request,
    response.res,
    next as unknown as NextFunction,
  );
  // Let the (instant) sleep and its continuation run.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { ...response, nexted: next.mock.calls.length > 0 };
}

/** A middleware whose sleeps are instant and whose randomness is scripted. */
function harness(
  config: unknown,
  randomValues: number[] = [0.5],
  clock = fakeClock(),
) {
  let index = 0;
  const random = () => randomValues[index++ % randomValues.length];
  const controller = new BehaviorController("identity", {
    now: clock.now,
    random,
    log: () => {},
  });
  controller.apply(config);
  const slept: number[] = [];
  const middleware = behaviorMiddleware(controller, {
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  return { controller, middleware, slept, clock };
}

describe("BehaviorController", () => {
  it("starts off", () => {
    const controller = new BehaviorController("identity", { log: () => {} });
    const state = controller.state();

    expect(state.enabled).toBe(false);
    expect(state.config).toEqual(BEHAVIOR_OFF);
    expect(state.preset).toBe("off");
    expect(state.applied_at).toBeNull();
    expect(state.counters).toEqual({
      requests: 0,
      delayed: 0,
      delay_ms_total: 0,
      injected_errors: 0,
      rate_limited: 0,
    });
  });

  it("applies a preset by id", () => {
    const controller = new BehaviorController("identity", { log: () => {} });
    const state = controller.apply({ preset: "flaky" }, { source: "simulation abc" });

    expect(state.enabled).toBe(true);
    expect(state.preset).toBe("flaky");
    expect(state.source).toBe("simulation abc");
    expect(state.config).toEqual(behaviorPreset("flaky")!.config);
  });

  it("lets fields override the preset they are sent with", () => {
    const controller = new BehaviorController("identity", { log: () => {} });
    const state = controller.apply({ preset: "flaky", error_rate: 0.5 });

    expect(state.config.error_rate).toBe(0.5);
    expect(state.config.latency).toEqual(behaviorPreset("flaky")!.config.latency);
    expect(state.preset).toBeNull(); // no longer a plain preset
  });

  it("rejects an unknown preset", () => {
    const controller = new BehaviorController("identity", { log: () => {} });
    expect(() => controller.apply({ preset: "chaos" })).toThrow(/Unknown behaviour preset/);
  });

  it("resets back to off", () => {
    const controller = new BehaviorController("identity", { log: () => {} });
    controller.apply({ preset: "slow" });
    const state = controller.reset();

    expect(state.enabled).toBe(false);
    expect(state.config).toEqual(BEHAVIOR_OFF);
    expect(state.source).toBeNull();
    expect(state.expires_at).toBeNull();
  });

  it("expires a config once its deadline passes", () => {
    const clock = fakeClock();
    const controller = new BehaviorController("identity", {
      now: clock.now,
      log: () => {},
    });
    const expiresAt = new Date(clock.now() + 60_000).toISOString();
    controller.apply({ preset: "flaky" }, { expiresAt });

    clock.advance(59_000);
    expect(controller.state().enabled).toBe(true);

    clock.advance(2_000);
    expect(controller.state().enabled).toBe(false);
    expect(controller.state().config).toEqual(BEHAVIOR_OFF);
  });

  it("keeps a config with an unparseable deadline rather than dropping it", () => {
    const controller = new BehaviorController("identity", { log: () => {} });
    controller.apply({ preset: "flaky" }, { expiresAt: "not-a-date" });
    expect(controller.state().enabled).toBe(true);
  });

  it("counts requests in a fixed window that rolls over", () => {
    const clock = fakeClock();
    const controller = new BehaviorController("identity", {
      now: clock.now,
      log: () => {},
    });
    const config = controller.apply({ rate_limit: { max: 2, window_ms: 1000 } }).config;

    expect(controller.countRequest(config).limited).toBe(false);
    expect(controller.countRequest(config).limited).toBe(false);

    const third = controller.countRequest(config);
    expect(third.limited).toBe(true);
    expect(third.retryAfterMs).toBe(1000);

    clock.advance(400);
    expect(controller.countRequest(config).retryAfterMs).toBe(600);

    clock.advance(700); // window has rolled over
    expect(controller.countRequest(config).limited).toBe(false);
    expect(controller.state().counters.requests).toBe(5);
  });
});

describe("behaviorMiddleware", () => {
  it("passes everything straight through when behaviour is off", async () => {
    const controller = new BehaviorController("identity", { log: () => {} });
    const result = await call(behaviorMiddleware(controller));

    expect(result.nexted).toBe(true);
    expect(result.statusCode).toBeNull();
    expect(controller.state().counters.requests).toBe(0);
  });

  it("delays a request by a sampled amount", async () => {
    const { middleware, slept, controller } = harness(
      { latency: { mean_ms: 300 } },
      [0.5],
    );

    const result = await call(middleware);

    expect(slept).toEqual([300]);
    expect(result.nexted).toBe(true);
    expect(result.headers["x-simdpg-behavior-delay-ms"]).toBe("300");
    expect(controller.state().counters).toMatchObject({
      requests: 1,
      delayed: 1,
      delay_ms_total: 300,
    });
  });

  it("injects a failure with the DCI envelope when the draw is under the rate", async () => {
    // A fixed delay (stddev 0) draws no randomness, so the only draw is the
    // one deciding whether this request fails.
    const { middleware, controller } = harness(
      { latency: { mean_ms: 100 }, error_rate: 0.5, error_status: 503 },
      [0.1],
    );

    const result = await call(middleware);

    expect(result.nexted).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.headers["x-simdpg-injected"]).toBe("failure");
    expect(result.body).toEqual({
      error: {
        code: "INJECTED_FAILURE",
        message: "Injected failure (simulated identity fault)",
        details: { injected: true, system: "identity", error_rate: 0.5 },
      },
    });
    expect(controller.state().counters.injected_errors).toBe(1);
  });

  it("lets the request through when the draw is above the rate", async () => {
    const { middleware, controller } = harness(
      { latency: { mean_ms: 100 }, error_rate: 0.5 },
      [0.9],
    );

    const result = await call(middleware);

    expect(result.nexted).toBe(true);
    expect(controller.state().counters.injected_errors).toBe(0);
  });

  it("still spends the latency on an injected failure", async () => {
    const { middleware, slept } = harness({ latency: { mean_ms: 250 }, error_rate: 1 });
    const result = await call(middleware);

    expect(slept).toEqual([250]);
    expect(result.nexted).toBe(false);
  });

  it("throttles past the window's allowance, without delaying the rejection", async () => {
    const { middleware, slept, controller } = harness({
      latency: { mean_ms: 100 },
      rate_limit: { max: 1, window_ms: 2000, status: 429 },
    });

    const first = await call(middleware);
    expect(first.nexted).toBe(true);

    const second = await call(middleware);
    expect(second.nexted).toBe(false);
    expect(second.statusCode).toBe(429);
    expect(second.headers["x-simdpg-injected"]).toBe("rate-limit");
    expect(second.headers["retry-after"]).toBe("2");
    expect(second.body).toMatchObject({
      error: {
        code: "RATE_LIMITED",
        details: { injected: true, system: "identity", limit: 1, window_ms: 2000 },
      },
    });
    // Only the first request paid the latency.
    expect(slept).toEqual([100]);
    expect(controller.state().counters.rate_limited).toBe(1);
  });

  it("leaves control-plane and liveness paths alone", async () => {
    const { middleware, slept, controller } = harness({
      latency: { mean_ms: 500 },
      error_rate: 1,
    });

    for (const path of [
      "/health",
      "/docs",
      "/openapi.yaml",
      "/admin",
      "/admin/behavior",
      "/admin/webhook-subscriptions",
    ]) {
      const result = await call(middleware, path);
      expect(result.nexted, path).toBe(true);
      expect(result.statusCode, path).toBeNull();
    }

    expect(slept).toEqual([]);
    expect(controller.state().counters.requests).toBe(0);
    expect(DEFAULT_BEHAVIOR_SKIP_PREFIXES).toContain("/admin");
  });

  it("stops injecting as soon as the config expires", async () => {
    const clock = fakeClock();
    const { middleware, controller } = harness({ error_rate: 1 }, [0.1], clock);
    controller.apply(
      { error_rate: 1 },
      { expiresAt: new Date(clock.now() + 30_000).toISOString() },
    );

    expect((await call(middleware)).statusCode).toBe(500);

    clock.advance(31_000);
    const afterExpiry = await call(middleware);
    expect(afterExpiry.nexted).toBe(true);
    expect(afterExpiry.statusCode).toBeNull();
  });
});

describe("createBehavior", () => {
  it("is off with an empty environment", () => {
    const { controller } = createBehavior("identity", { env: {}, log: () => {} });
    expect(controller.state().enabled).toBe(false);
  });

  it("applies SIMDPG_BEHAVIOR_PRESET at startup", () => {
    const { controller } = createBehavior("identity", {
      env: { SIMDPG_BEHAVIOR_PRESET: "slow" },
      log: () => {},
    });

    const state = controller.state();
    expect(state.preset).toBe("slow");
    expect(state.source).toBe("environment");
  });

  it("merges SIMDPG_BEHAVIOR JSON over the preset", () => {
    const { controller } = createBehavior("identity", {
      env: {
        SIMDPG_BEHAVIOR_PRESET: "flaky",
        SIMDPG_BEHAVIOR: '{"error_rate":0.25}',
      },
      log: () => {},
    });

    expect(controller.state().config).toEqual(
      parseBehavior({ error_rate: 0.25 }, behaviorPreset("flaky")!.config),
    );
  });

  it("ignores malformed JSON rather than failing to boot", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { controller } = createBehavior("identity", {
      env: { SIMDPG_BEHAVIOR: "{not json" },
      log: () => {},
    });

    expect(controller.state().enabled).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("ignores an unknown preset rather than failing to boot", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { controller } = createBehavior("identity", {
      env: { SIMDPG_BEHAVIOR_PRESET: "chaos" },
      log: () => {},
    });

    expect(controller.state().enabled).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
