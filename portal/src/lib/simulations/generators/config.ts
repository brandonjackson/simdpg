import raw from "./config.json";

export interface GeneratorConfig {
  nationalId: { dailyProbPerCitizen: number };
  death: { dailyRatePerPopulation: number; stepDelaySeconds: number };
  birth: { dailyRatePerPopulation: number };
  marriage: { dailyRatePerPopulation: number };
  benefits: {
    dailyRatePerPopulation: number;
    chainProbabilities: { toStep2: number; toStep3: number };
    stepDelaySeconds: number;
  };
}

export type FieldKind = "rate" | "probability";

export interface ConfigFieldDescriptor {
  /** Path into the nested GeneratorConfig. */
  path: readonly string[];
  /** "rate" clamps to >= 0; "probability" clamps to [0, 1]. */
  kind: FieldKind;
  /** Whether the create wizard exposes this field for editing. */
  editable: boolean;
  /** Conservative fallback used when the field is missing/malformed. */
  default: number;
  /** Human label for the wizard and detail page. */
  label: string;
}

/** Single source of truth for fallback defaults, validation, and UI metadata. */
export const GENERATOR_CONFIG_FIELDS: readonly ConfigFieldDescriptor[] = [
  { path: ["nationalId", "dailyProbPerCitizen"],         kind: "rate",        editable: true,  default: 0.02,      label: "National ID – daily probability per citizen" },
  { path: ["death", "dailyRatePerPopulation"],           kind: "rate",        editable: true,  default: 0.000001,  label: "Death – daily rate per population" },
  { path: ["death", "stepDelaySeconds"],                 kind: "rate",        editable: false, default: 300,       label: "Death – step delay (seconds)" },
  { path: ["birth", "dailyRatePerPopulation"],           kind: "rate",        editable: true,  default: 0.00005,   label: "Birth – daily rate per population" },
  { path: ["marriage", "dailyRatePerPopulation"],        kind: "rate",        editable: true,  default: 0.0000015, label: "Marriage – daily rate per population" },
  { path: ["benefits", "dailyRatePerPopulation"],        kind: "rate",        editable: true,  default: 0.00001,   label: "Benefits – daily rate per population" },
  { path: ["benefits", "chainProbabilities", "toStep2"], kind: "probability", editable: true,  default: 0.7,       label: "Benefits – chance to advance to step 2" },
  { path: ["benefits", "chainProbabilities", "toStep3"], kind: "probability", editable: true,  default: 0.5,       label: "Benefits – chance to advance to step 3" },
  { path: ["benefits", "stepDelaySeconds"],              kind: "rate",        editable: false, default: 300,       label: "Benefits – step delay (seconds)" },
] as const;

function readPath(source: unknown, path: readonly string[]): unknown {
  let cur: unknown = source;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Set a nested numeric field on a fresh deep clone; returns the clone. */
export function setConfigValue(
  config: GeneratorConfig,
  path: readonly string[],
  value: number,
): GeneratorConfig {
  const next = structuredClone(config);
  let cur: Record<string, unknown> = next as unknown as Record<string, unknown>;
  for (const key of path.slice(0, -1)) {
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
  return next;
}

/** Read a nested numeric field by path. */
export function getConfigValue(config: GeneratorConfig, path: readonly string[]): number {
  return readPath(config, path) as number;
}

function clamp(kind: FieldKind, value: number): number {
  const nonNeg = Math.max(0, value);
  return kind === "probability" ? Math.min(1, nonNeg) : nonNeg;
}

/**
 * Merge a config source over the registry fallbacks so a missing or malformed
 * field never crashes generation. Each field is validated as a finite number
 * then clamped per its kind. Defaults to the JSON asset.
 */
export function loadConfig(source: unknown = raw): GeneratorConfig {
  // Seed with zeros, then set each descriptor's validated value by path.
  let result: GeneratorConfig = {
    nationalId: { dailyProbPerCitizen: 0 },
    death: { dailyRatePerPopulation: 0, stepDelaySeconds: 0 },
    birth: { dailyRatePerPopulation: 0 },
    marriage: { dailyRatePerPopulation: 0 },
    benefits: {
      dailyRatePerPopulation: 0,
      chainProbabilities: { toStep2: 0, toStep3: 0 },
      stepDelaySeconds: 0,
    },
  };
  for (const field of GENERATOR_CONFIG_FIELDS) {
    const rawValue = readPath(source, field.path);
    const valid =
      typeof rawValue === "number" && Number.isFinite(rawValue)
        ? clamp(field.kind, rawValue)
        : field.default;
    result = setConfigValue(result, field.path, valid);
  }
  return result;
}

/** Singleton loaded from the JSON asset, imported as the default config. */
export const GENERATOR_CONFIG: GeneratorConfig = loadConfig();
