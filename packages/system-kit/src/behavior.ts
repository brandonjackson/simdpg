/**
 * Stochastic behaviour configuration — latency, injected failures, and rate
 * limiting.
 *
 * The config keys are deliberately the same as
 * [openfn-mocker](https://github.com/brandonjackson/openfn-mocker#simulating-stochastic-behavior)
 * so a config written for one is readable by the other:
 *
 *   latency: { mean_ms, stddev_ms, min_ms, max_ms }
 *   error_rate / error_status
 *   rate_limit: { max, window_ms, status }
 *
 * Two deliberate departures from the mocker, both supersets of its config:
 *
 * - `max_ms` accepts `null` (and defaults to it) instead of the mocker's `∞`,
 *   because this config travels as JSON, which has no Infinity. `null` means
 *   "no upper clamp"; a number clamps exactly as the mocker's `max_ms` does.
 * - Values are clamped rather than rejected (an `error_rate` of 2 becomes 1),
 *   matching how the portal's generator config already treats its numbers.
 *
 * This module is intentionally free of runtime dependencies — no express, no
 * zod — so the portal's browser bundle can import it for the config UI. The
 * express-facing runtime lives in ./behavior-runtime.ts.
 */

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface BehaviorLatency {
  /** Average delay in milliseconds. */
  mean_ms: number;
  /** Standard deviation; 0 makes every response take exactly `mean_ms`. */
  stddev_ms: number;
  /** Lower clamp applied after sampling. */
  min_ms: number;
  /** Upper clamp applied after sampling; null means no cap. */
  max_ms: number | null;
}

export interface BehaviorRateLimit {
  /** Requests allowed per window; 0 disables the limiter. */
  max: number;
  /** Counting window length in milliseconds. */
  window_ms: number;
  /** Status returned once the window's allowance is spent. */
  status: number;
}

export interface BehaviorConfig {
  latency: BehaviorLatency;
  /** Probability in [0, 1] that a request gets a synthetic failure. */
  error_rate: number;
  /** Status used for injected failures. */
  error_status: number;
  rate_limit: BehaviorRateLimit;
}

// ---------------------------------------------------------------------------
// Field registry — the single source of truth for defaults, validation and UI
// ---------------------------------------------------------------------------

export type BehaviorFieldKind =
  /** Non-negative integer milliseconds. */
  | "ms"
  /** Non-negative integer milliseconds, or null for "no limit". */
  | "optional_ms"
  /** Number in [0, 1]. */
  | "probability"
  /** HTTP status in [400, 599]. */
  | "status"
  /** Non-negative integer count. */
  | "count"
  /** Positive integer milliseconds (a window can't be zero-length). */
  | "window_ms";

export interface BehaviorFieldDescriptor {
  /** Path into the nested {@link BehaviorConfig}. */
  path: readonly string[];
  kind: BehaviorFieldKind;
  /** Value used when the field is missing or malformed — the "off" default. */
  default: number | null;
  /** Human label for the config screen and the run's detail page. */
  label: string;
  /** Optional one-line explanation shown under the input. */
  hint?: string;
}

/**
 * Every configurable field, in the order the config screen shows them. Adding a
 * knob means adding one row here: parsing, clamping, the form, and the summary
 * all read from this registry.
 */
export const BEHAVIOR_FIELDS: readonly BehaviorFieldDescriptor[] = [
  {
    path: ["latency", "mean_ms"],
    kind: "ms",
    default: 0,
    label: "Latency – mean (ms)",
    hint: "Average delay added before each request is handled.",
  },
  {
    path: ["latency", "stddev_ms"],
    kind: "ms",
    default: 0,
    label: "Latency – standard deviation (ms)",
    hint: "Spread of the delay. 0 makes every response take exactly the mean.",
  },
  {
    path: ["latency", "min_ms"],
    kind: "ms",
    default: 0,
    label: "Latency – minimum (ms)",
    hint: "Lower clamp applied after sampling.",
  },
  {
    path: ["latency", "max_ms"],
    kind: "optional_ms",
    default: null,
    label: "Latency – maximum (ms)",
    hint: "Upper clamp applied after sampling. Leave blank for no cap.",
  },
  {
    path: ["error_rate"],
    kind: "probability",
    default: 0,
    label: "Error rate",
    hint: "Share of requests answered with a synthetic failure, between 0 and 1.",
  },
  {
    path: ["error_status"],
    kind: "status",
    default: 500,
    label: "Error status",
    hint: "HTTP status used for injected failures.",
  },
  {
    path: ["rate_limit", "max"],
    kind: "count",
    default: 0,
    label: "Rate limit – requests per window",
    hint: "Requests served per window before throttling starts. 0 disables it.",
  },
  {
    path: ["rate_limit", "window_ms"],
    kind: "window_ms",
    default: 1000,
    label: "Rate limit – window (ms)",
    hint: "Length of the counting window.",
  },
  {
    path: ["rate_limit", "status"],
    kind: "status",
    default: 429,
    label: "Rate limit – status",
    hint: "HTTP status returned to throttled requests.",
  },
] as const;

// ---------------------------------------------------------------------------
// Reading / writing nested fields
// ---------------------------------------------------------------------------

function readPath(source: unknown, path: readonly string[]): unknown {
  let cur: unknown = source;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Read a field by path, e.g. `["latency", "mean_ms"]`. */
export function getBehaviorValue(
  config: BehaviorConfig,
  path: readonly string[],
): number | null {
  return readPath(config, path) as number | null;
}

/** Set a field by path on a fresh deep clone; returns the clone. */
export function setBehaviorValue(
  config: BehaviorConfig,
  path: readonly string[],
  value: number | null,
): BehaviorConfig {
  const next = structuredClone(config);
  let cur = next as unknown as Record<string, unknown>;
  for (const key of path.slice(0, -1)) {
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
  return next;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function clampField(
  kind: BehaviorFieldKind,
  value: number,
): number {
  switch (kind) {
    case "probability":
      return Math.min(1, Math.max(0, value));
    case "status":
      // Anything outside the error range would turn an "injected failure" into
      // a success, so keep it inside 4xx/5xx.
      return Math.min(599, Math.max(400, Math.round(value)));
    case "window_ms":
      return Math.max(1, Math.round(value));
    case "ms":
    case "optional_ms":
    case "count":
      return Math.max(0, Math.round(value));
  }
}

/**
 * Build a valid config from an arbitrary source, field by field: a value that
 * is missing or malformed falls back to `base` (the "off" defaults unless a
 * base is given), and every value present is clamped for its kind. Nested
 * `latency` / `rate_limit` maps therefore merge key-by-key, as they do in the
 * mocker, so `{ latency: { mean_ms: 400 } }` keeps the base's stddev.
 *
 * Never throws: a garbage source yields the base config.
 */
export function parseBehavior(
  source: unknown,
  base: BehaviorConfig = BEHAVIOR_OFF,
): BehaviorConfig {
  let result = base;

  for (const field of BEHAVIOR_FIELDS) {
    const raw = readPath(source, field.path);

    if (raw === undefined) continue;
    // An explicit null clears an "optional" field (no latency cap); for every
    // other field it just means "unset", so the base value stands.
    if (raw === null) {
      if (field.kind === "optional_ms") result = setBehaviorValue(result, field.path, null);
      continue;
    }
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;

    result = setBehaviorValue(result, field.path, clampField(field.kind, raw));
  }

  // A max below the min would otherwise win the clamp and silently invert the
  // range; raising it to the min keeps sampling well-defined.
  if (result.latency.max_ms !== null && result.latency.max_ms < result.latency.min_ms) {
    result = setBehaviorValue(result, ["latency", "max_ms"], result.latency.min_ms);
  }

  return result;
}

function offDefaults(): BehaviorConfig {
  let config: BehaviorConfig = {
    latency: { mean_ms: 0, stddev_ms: 0, min_ms: 0, max_ms: null },
    error_rate: 0,
    error_status: 500,
    rate_limit: { max: 0, window_ms: 1000, status: 429 },
  };
  // Keep the literal above honest: the registry's defaults are authoritative.
  for (const field of BEHAVIOR_FIELDS) {
    config = setBehaviorValue(config, field.path, field.default);
  }
  return config;
}

/** The default: no added latency, no injected failures, no rate limiting. */
export const BEHAVIOR_OFF: BehaviorConfig = offDefaults();

// ---------------------------------------------------------------------------
// Predicates and summaries
// ---------------------------------------------------------------------------

/** Whether the latency block would delay anything. */
export function hasLatency(latency: BehaviorLatency): boolean {
  return latency.mean_ms > 0 || latency.stddev_ms > 0 || latency.min_ms > 0;
}

/** Whether a config changes nothing — i.e. systems behave normally. */
export function isBehaviorOff(config: BehaviorConfig): boolean {
  return (
    !hasLatency(config.latency) &&
    config.error_rate <= 0 &&
    config.rate_limit.max <= 0
  );
}

function formatPercent(rate: number): string {
  const percent = rate * 100;
  const rounded = percent < 1 ? Number(percent.toFixed(2)) : Math.round(percent * 10) / 10;
  return `${rounded}%`;
}

/** One-line plain-English summary, for the wizard and the run's detail page. */
export function describeBehavior(config: BehaviorConfig): string {
  if (isBehaviorOff(config)) return "Off — systems respond normally";

  const parts: string[] = [];

  if (hasLatency(config.latency)) {
    const { mean_ms, stddev_ms, max_ms } = config.latency;
    const spread = stddev_ms > 0 ? ` ± ${stddev_ms} ms` : "";
    const cap = max_ms !== null ? `, capped at ${max_ms} ms` : "";
    parts.push(`${mean_ms} ms${spread} latency${cap}`);
  }

  if (config.error_rate > 0) {
    parts.push(
      `${formatPercent(config.error_rate)} of requests fail with ${config.error_status}`,
    );
  }

  if (config.rate_limit.max > 0) {
    parts.push(
      `${config.rate_limit.max} requests per ${config.rate_limit.window_ms} ms, then ${config.rate_limit.status}`,
    );
  }

  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface BehaviorPreset {
  id: string;
  name: string;
  /** What this preset is for — shown as the option's hint. */
  description: string;
  config: BehaviorConfig;
}

/**
 * Ready-made profiles for the common things people want to rehearse. The mocker
 * documents the raw knobs rather than named profiles, so these presets are ours;
 * each one is only a {@link BehaviorConfig}, so anything a preset does can also
 * be typed in by hand.
 */
export const BEHAVIOR_PRESETS: readonly BehaviorPreset[] = [
  {
    id: "off",
    name: "Off",
    description:
      "Systems respond normally — no added latency, failures, or throttling. The default.",
    config: BEHAVIOR_OFF,
  },
  {
    id: "realistic",
    name: "Realistic",
    description:
      "Healthy production systems on a good day: a few hundred ms of jitter and the occasional 503.",
    config: parseBehavior({
      latency: { mean_ms: 200, stddev_ms: 60, min_ms: 20, max_ms: 1500 },
      error_rate: 0.005,
      error_status: 503,
    }),
  },
  {
    id: "slow",
    name: "Slow",
    description:
      "Congested or legacy systems: over a second per call, so workflows must cope with long waits.",
    config: parseBehavior({
      latency: { mean_ms: 1200, stddev_ms: 400, min_ms: 200, max_ms: 5000 },
      error_rate: 0.01,
      error_status: 503,
    }),
  },
  {
    id: "flaky",
    name: "Flaky",
    description:
      "An unreliable link: 1 request in 10 fails with a 503, so retry and error handling get exercised.",
    config: parseBehavior({
      latency: { mean_ms: 400, stddev_ms: 250, min_ms: 20, max_ms: 4000 },
      error_rate: 0.1,
      error_status: 503,
    }),
  },
  {
    id: "rate-limited",
    name: "Rate limited",
    description:
      "A throttled API: 20 requests per second, then 429s. Deterministic, so it's the one to use for load tests.",
    config: parseBehavior({
      latency: { mean_ms: 150, stddev_ms: 50, min_ms: 20, max_ms: 1000 },
      rate_limit: { max: 20, window_ms: 1000, status: 429 },
    }),
  },
  {
    id: "overloaded",
    name: "Overloaded",
    description:
      "Systems in trouble: seconds-long responses, a tight throttle, and 5% outright failures.",
    config: parseBehavior({
      latency: { mean_ms: 2000, stddev_ms: 800, min_ms: 400, max_ms: 10_000 },
      error_rate: 0.05,
      error_status: 503,
      rate_limit: { max: 10, window_ms: 1000, status: 429 },
    }),
  },
] as const;

export function behaviorPreset(id: string): BehaviorPreset | undefined {
  return BEHAVIOR_PRESETS.find((preset) => preset.id === id);
}

/**
 * The preset a config corresponds to, or null when its values have been
 * hand-edited. Both sides are built by the same writer, so their JSON key order
 * matches and a string compare is enough.
 */
export function matchBehaviorPreset(config: BehaviorConfig): BehaviorPreset | null {
  const encoded = JSON.stringify(config);
  return (
    BEHAVIOR_PRESETS.find((preset) => JSON.stringify(preset.config) === encoded) ?? null
  );
}

/** Preset name, or "Custom" for a hand-edited config. */
export function behaviorPresetLabel(config: BehaviorConfig): string {
  return matchBehaviorPreset(config)?.name ?? "Custom";
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/** One standard-normal sample, Box–Muller. `random` must yield [0, 1). */
function gaussian(random: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Draw a delay from N(mean_ms, stddev_ms), clamped to [min_ms, max_ms] — the
 * mocker's latency model. Returns whole milliseconds, never negative.
 */
export function sampleLatencyMs(
  latency: BehaviorLatency,
  random: () => number = Math.random,
): number {
  if (!hasLatency(latency)) return 0;

  const sampled =
    latency.stddev_ms > 0
      ? latency.mean_ms + gaussian(random) * latency.stddev_ms
      : latency.mean_ms;

  const floored = Math.max(latency.min_ms, sampled);
  const capped = latency.max_ms === null ? floored : Math.min(latency.max_ms, floored);

  return Math.max(0, Math.round(capped));
}
