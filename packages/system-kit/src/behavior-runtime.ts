/**
 * The express side of stochastic behaviour: a per-process controller holding the
 * current {@link BehaviorConfig}, middleware that applies it to every inbound
 * request, and an admin router for reading, setting, and clearing it.
 *
 * Behaviour is off by default. Nothing here has any effect until something calls
 * `PUT /admin/behavior` (the simulation worker does, for the length of a run) or
 * the system starts with `SIMDPG_BEHAVIOR_PRESET` / `SIMDPG_BEHAVIOR` set.
 */

import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import {
  BEHAVIOR_OFF,
  behaviorPreset,
  isBehaviorOff,
  matchBehaviorPreset,
  parseBehavior,
  sampleLatencyMs,
  type BehaviorConfig,
} from "./behavior.js";
import type { ErrorEnvelope } from "./errors.js";

/** Paths never touched by injected latency, failures, or throttling. */
export const DEFAULT_BEHAVIOR_SKIP_PREFIXES: readonly string[] = [
  // Liveness must stay honest: platform health checks and the portal's
  // service-status page shouldn't see a simulated fault as a dead system.
  "/health",
  "/docs",
  "/openapi.yaml",
  // The control plane. If injection covered /admin, a 100%-error config would
  // lock out the very endpoint that clears it — and staff pages (population
  // stats, webhook registration) would go flaky mid-run for no good reason.
  "/admin",
];

export interface BehaviorCounters {
  /** Requests seen while behaviour was enabled (skipped paths excluded). */
  requests: number;
  delayed: number;
  delay_ms_total: number;
  injected_errors: number;
  rate_limited: number;
}

export interface BehaviorState {
  system: string;
  /** False when the current config changes nothing. */
  enabled: boolean;
  config: BehaviorConfig;
  /** Matching preset id, or null when the config was hand-edited. */
  preset: string | null;
  /** Free-text note about who applied it, e.g. "simulation 1a2b3c4d". */
  source: string | null;
  applied_at: string | null;
  /** When the config self-clears, so a lost caller can't leave systems faulty. */
  expires_at: string | null;
  counters: BehaviorCounters;
}

export interface ApplyBehaviorOptions {
  source?: string | null;
  /** ISO timestamp after which the config reverts to off. */
  expiresAt?: string | null;
}

export interface BehaviorControllerDeps {
  now?: () => number;
  random?: () => number;
  log?: (message: string) => void;
}

function zeroCounters(): BehaviorCounters {
  return {
    requests: 0,
    delayed: 0,
    delay_ms_total: 0,
    injected_errors: 0,
    rate_limited: 0,
  };
}

/**
 * Holds one system's current behaviour. In-memory on purpose: a restarted system
 * comes back with behaviour off, which is the safe default and one more way a
 * run's faults can't outlive it.
 */
export class BehaviorController {
  private config: BehaviorConfig = BEHAVIOR_OFF;
  private source: string | null = null;
  private appliedAt: string | null = null;
  private expiresAt: string | null = null;
  private counters: BehaviorCounters = zeroCounters();
  /** Fixed-window rate-limit state: window start and requests served in it. */
  private window = { startMs: 0, count: 0 };

  private readonly now: () => number;
  readonly random: () => number;
  private readonly log: (message: string) => void;

  constructor(
    readonly system: string,
    deps: BehaviorControllerDeps = {},
  ) {
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.log = deps.log ?? ((message) => console.log(message));
  }

  /** The config in force right now, expiring a stale one first. */
  current(): BehaviorConfig {
    this.expireIfDue();
    return this.config;
  }

  state(): BehaviorState {
    const config = this.current();
    return {
      system: this.system,
      enabled: !isBehaviorOff(config),
      config,
      preset: matchBehaviorPreset(config)?.id ?? null,
      source: this.source,
      applied_at: this.appliedAt,
      expires_at: this.expiresAt,
      counters: { ...this.counters },
    };
  }

  /**
   * Replace the config. `source` accepts a bare {@link BehaviorConfig}, a
   * partial one (each field falling back to off), or `{ preset: "flaky" }` with
   * optional overrides on top. Counters and the rate-limit window restart, so a
   * run's numbers only ever describe that run.
   */
  apply(source: unknown, options: ApplyBehaviorOptions = {}): BehaviorState {
    const presetId = (source as { preset?: unknown } | null)?.preset;
    const base =
      typeof presetId === "string" ? behaviorPreset(presetId)?.config : undefined;
    if (typeof presetId === "string" && !base) {
      throw new Error(`Unknown behaviour preset: ${presetId}`);
    }

    this.config = parseBehavior(source, base ?? BEHAVIOR_OFF);
    this.source = typeof options.source === "string" ? options.source : null;
    this.appliedAt = new Date(this.now()).toISOString();
    this.expiresAt = options.expiresAt ?? null;
    this.counters = zeroCounters();
    this.window = { startMs: 0, count: 0 };

    const state = this.state();
    this.log(
      state.enabled
        ? `[${this.system}] behaviour applied${this.source ? ` by ${this.source}` : ""}: ` +
            `${JSON.stringify(this.config)}${this.expiresAt ? ` (expires ${this.expiresAt})` : ""}`
        : `[${this.system}] behaviour set to off${this.source ? ` by ${this.source}` : ""}`,
    );
    return state;
  }

  /** Back to the default: no latency, no failures, no throttling. */
  reset(reason = "reset"): BehaviorState {
    const wasEnabled = !isBehaviorOff(this.config);
    this.config = BEHAVIOR_OFF;
    this.source = null;
    this.appliedAt = null;
    this.expiresAt = null;
    this.counters = zeroCounters();
    this.window = { startMs: 0, count: 0 };
    if (wasEnabled) this.log(`[${this.system}] behaviour cleared (${reason})`);
    return this.state();
  }

  /** Clear an expired config so it can't outlive the run that set it. */
  private expireIfDue(): void {
    if (!this.expiresAt) return;
    const expiresMs = Date.parse(this.expiresAt);
    if (Number.isNaN(expiresMs) || this.now() < expiresMs) return;
    this.reset("expired");
  }

  /**
   * Count one request against the fixed window. Returns whether it must be
   * throttled and how long until the window rolls over.
   */
  countRequest(config: BehaviorConfig): { limited: boolean; retryAfterMs: number } {
    this.counters.requests += 1;

    const { max, window_ms } = config.rate_limit;
    if (max <= 0) return { limited: false, retryAfterMs: 0 };

    const nowMs = this.now();
    if (nowMs - this.window.startMs >= window_ms) {
      this.window = { startMs: nowMs, count: 0 };
    }

    this.window.count += 1;
    if (this.window.count <= max) return { limited: false, retryAfterMs: 0 };

    return {
      limited: true,
      retryAfterMs: Math.max(0, this.window.startMs + window_ms - nowMs),
    };
  }

  recordDelay(ms: number): void {
    this.counters.delayed += 1;
    this.counters.delay_ms_total += ms;
  }

  recordInjectedError(): void {
    this.counters.injected_errors += 1;
  }

  recordRateLimited(): void {
    this.counters.rate_limited += 1;
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export interface BehaviorMiddlewareOptions {
  /** Path prefixes left alone. Defaults to {@link DEFAULT_BEHAVIOR_SKIP_PREFIXES}. */
  skipPrefixes?: readonly string[];
  /** Injected for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

function isSkipped(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendInjected(
  res: Response,
  status: number,
  envelope: ErrorEnvelope,
  marker: "failure" | "rate-limit",
): void {
  res.setHeader("X-Simdpg-Injected", marker);
  res.status(status).json(envelope);
}

/**
 * Apply the controller's current behaviour to each request:
 *
 * 1. throttled requests are answered immediately with the rate-limit status —
 *    no latency first, so a load test sees a clean, fast rejection;
 * 2. otherwise the request sleeps for a delay drawn from N(mean_ms, stddev_ms),
 *    clamped to [min_ms, max_ms];
 * 3. then, with probability `error_rate`, it is answered with `error_status`
 *    instead of reaching the handler — so an injected failure has still "cost"
 *    its latency, as a real failing call would.
 *
 * Injected responses use the same DCI error envelope as every other error in
 * these systems (rather than the mocker's bare `{ error, injected }` body), so
 * an OpenFn job's error handling doesn't need a special case; `injected: true`
 * in `details` and the `X-Simdpg-Injected` header identify them.
 */
export function behaviorMiddleware(
  controller: BehaviorController,
  options: BehaviorMiddlewareOptions = {},
): RequestHandler {
  const skipPrefixes = options.skipPrefixes ?? DEFAULT_BEHAVIOR_SKIP_PREFIXES;
  const sleep = options.sleep ?? realSleep;

  return function behavior(req: Request, res: Response, next: NextFunction): void {
    const config = controller.current();
    if (isBehaviorOff(config) || isSkipped(req.path, skipPrefixes)) {
      next();
      return;
    }

    const { limited, retryAfterMs } = controller.countRequest(config);
    if (limited) {
      controller.recordRateLimited();
      res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      sendInjected(
        res,
        config.rate_limit.status,
        {
          error: {
            code: "RATE_LIMITED",
            message:
              `Rate limit exceeded: ${config.rate_limit.max} requests per ` +
              `${config.rate_limit.window_ms} ms (simulated)`,
            details: {
              injected: true,
              system: controller.system,
              limit: config.rate_limit.max,
              window_ms: config.rate_limit.window_ms,
              retry_after_ms: retryAfterMs,
            },
          },
        },
        "rate-limit",
      );
      return;
    }

    const delayMs = sampleLatencyMs(config.latency, controller.random);

    const proceed = (): void => {
      if (delayMs > 0) {
        controller.recordDelay(delayMs);
        res.setHeader("X-Simdpg-Behavior-Delay-Ms", String(delayMs));
      }

      if (config.error_rate > 0 && controller.random() < config.error_rate) {
        controller.recordInjectedError();
        sendInjected(
          res,
          config.error_status,
          {
            error: {
              code: "INJECTED_FAILURE",
              message: `Injected failure (simulated ${controller.system} fault)`,
              details: {
                injected: true,
                system: controller.system,
                error_rate: config.error_rate,
              },
            },
          },
          "failure",
        );
        return;
      }

      next();
    };

    if (delayMs === 0) {
      proceed();
      return;
    }
    // Express can't catch a rejection from an async continuation, so hand any
    // failure (e.g. the client vanished mid-delay) to the error handler.
    void sleep(delayMs).then(proceed, next);
  };
}

// ---------------------------------------------------------------------------
// Admin router
// ---------------------------------------------------------------------------

function badRequestEnvelope(message: string): ErrorEnvelope {
  return { error: { code: "BAD_REQUEST", message, details: null } };
}

/**
 * `GET`, `PUT` and `DELETE /admin/behavior`, all returning the system's
 * {@link BehaviorState}. The PUT body is a behaviour config, optionally with
 * `preset`, `source`, and `expires_at`.
 */
export function behaviorRouter(controller: BehaviorController): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(controller.state());
  });

  router.put("/", (req, res) => {
    const body = req.body;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json(badRequestEnvelope("Body must be a behaviour config object"));
      return;
    }

    const { expires_at: expiresAt, source } = body as {
      expires_at?: unknown;
      source?: unknown;
    };
    if (expiresAt !== undefined && expiresAt !== null) {
      if (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt))) {
        res
          .status(400)
          .json(badRequestEnvelope("expires_at must be an ISO 8601 timestamp"));
        return;
      }
    }

    try {
      res.json(
        controller.apply(body, {
          source: typeof source === "string" ? source : null,
          expiresAt: typeof expiresAt === "string" ? expiresAt : null,
        }),
      );
    } catch (err) {
      res
        .status(400)
        .json(badRequestEnvelope(err instanceof Error ? err.message : "Invalid config"));
    }
  });

  router.delete("/", (_req, res) => {
    res.json(controller.reset("cleared via admin endpoint"));
  });

  return router;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export interface BehaviorHarness {
  controller: BehaviorController;
  middleware: RequestHandler;
  router: Router;
}

export interface CreateBehaviorOptions
  extends BehaviorControllerDeps,
    BehaviorMiddlewareOptions {
  /** Environment read for the startup config. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

/**
 * Build a system's behaviour controller, middleware, and admin router.
 *
 * Behaviour starts off unless the environment asks otherwise:
 * `SIMDPG_BEHAVIOR_PRESET=flaky` selects a preset, and `SIMDPG_BEHAVIOR` takes a
 * JSON config (merged over the preset when both are set) — handy for a deployed
 * system that should be permanently degraded, independent of any simulation.
 */
export function createBehavior(
  system: string,
  options: CreateBehaviorOptions = {},
): BehaviorHarness {
  const controller = new BehaviorController(system, options);
  const env = options.env ?? process.env;

  const preset = env.SIMDPG_BEHAVIOR_PRESET?.trim();
  const raw = env.SIMDPG_BEHAVIOR?.trim();
  if (preset || raw) {
    let parsed: unknown = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.error(`[${system}] SIMDPG_BEHAVIOR is not valid JSON; ignoring it`);
      }
    }
    const source = preset ? { preset, ...(parsed as object) } : parsed;
    try {
      controller.apply(source, { source: "environment" });
    } catch (err) {
      console.error(
        `[${system}] ignoring environment behaviour config: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    controller,
    middleware: behaviorMiddleware(controller, options),
    router: behaviorRouter(controller),
  };
}
