# Per-simulation generator chances — design

**Issue:** #76 — Enable configuration of RandomEventGenerator chances in the Simulation screen.

## Problem

Today the only way to change the chances used by the RandomEventGenerators is to
hand-edit `portal/src/lib/simulations/generators/config.json`. Staff running
simulations need to tune these chances from the UI.

A secondary problem surfaced during design: the config schema is spread across
four places, so adding or changing a generator field is error-prone. This design
consolidates it.

## Decisions

- **Scope: per-simulation.** Each simulation stores its own chances in its
  parameters, edited in the "Start new simulation" wizard. Reproducible and
  self-contained, matching how `clockSpeed` / `durationSeconds` already work.
- **Editable fields: rates & probabilities only.** The "chances": nationalId
  prob, death / birth / marriage / benefits daily rates, and benefits chain
  probabilities (`toStep2` / `toStep3`). `stepDelaySeconds` fields stay at their
  defaults and ride along in the stored config so generators have everything.
- **Single source of truth: a field descriptor registry** (see below).

## Config schema consolidation

### Today (four places)

1. `GeneratorConfig` interface — the type.
2. `DEFAULTS` constant — fallback values.
3. `loadConfig()` — hand-written per-field validation choosing `nonNeg` vs `prob`.
4. `config.json` — the live values.

Adding a field means editing all four (and now the wizard + parse layer too).

### Proposed: `GENERATOR_CONFIG_FIELDS` registry

Introduce one array in `config.ts` as the source of truth for values,
validation, and UI metadata:

```ts
type FieldKind = "rate" | "probability";

interface ConfigFieldDescriptor {
  /** Path into the nested GeneratorConfig, e.g. ["benefits","chainProbabilities","toStep2"]. */
  path: readonly string[];
  /** "rate" clamps to >= 0; "probability" clamps to [0, 1]. */
  kind: FieldKind;
  /** Whether the wizard exposes this field for editing. */
  editable: boolean;
  /** Default / fallback value. */
  default: number;
  /** Human label for the wizard and detail page. */
  label: string;
}

const GENERATOR_CONFIG_FIELDS: readonly ConfigFieldDescriptor[] = [
  { path: ["nationalId", "dailyProbPerCitizen"],          kind: "rate",        editable: true,  default: 0.02,      label: "National ID – daily probability per citizen" },
  { path: ["death", "dailyRatePerPopulation"],            kind: "rate",        editable: true,  default: 0.000001,  label: "Death – daily rate per population" },
  { path: ["death", "stepDelaySeconds"],                  kind: "rate",        editable: false, default: 300,       label: "Death – step delay (seconds)" },
  { path: ["birth", "dailyRatePerPopulation"],            kind: "rate",        editable: true,  default: 0.00005,   label: "Birth – daily rate per population" },
  { path: ["marriage", "dailyRatePerPopulation"],         kind: "rate",        editable: true,  default: 0.0000015, label: "Marriage – daily rate per population" },
  { path: ["benefits", "dailyRatePerPopulation"],         kind: "rate",        editable: true,  default: 0.00001,   label: "Benefits – daily rate per population" },
  { path: ["benefits", "chainProbabilities", "toStep2"],  kind: "probability", editable: true,  default: 0.7,       label: "Benefits – chance to advance to step 2" },
  { path: ["benefits", "chainProbabilities", "toStep3"],  kind: "probability", editable: true,  default: 0.5,       label: "Benefits – chance to advance to step 3" },
  { path: ["benefits", "stepDelaySeconds"],               kind: "rate",        editable: false, default: 300,       label: "Benefits – step delay (seconds)" },
] as const;
```

The `default` values above are the current **internal `DEFAULTS`** — the
conservative fallbacks used when a field is missing or malformed. They are
deliberately *not* the `config.json` values: those two differ today, and the
existing `config.test.ts` asserts `loadConfig({})` returns these fallbacks. The
registry just relocates the `DEFAULTS` constant into descriptor form.

`config.json` is unchanged and stays as the **live-values override** the
`GENERATOR_CONFIG` singleton loads — larger, tuned rates that override the
fallbacks. The wizard therefore initializes its inputs from `GENERATOR_CONFIG`
(the live config.json values), not the registry fallbacks.

Everything derives from this one list via small get/set-by-path helpers:

- **`loadConfig(source)`** builds the config by iterating the registry: for each
  field, read `source` at `path`, validate as a finite number, then clamp per
  `kind` (`rate` → `>= 0`, `probability` → `[0, 1]`), falling back to `default`
  when missing/malformed. Replaces the hand-written per-field branches, and
  preserves the existing `loadConfig({})` → fallbacks behaviour.
- **Fallback defaults** come from the registry `default`s; **live values** stay
  in `config.json`, which `GENERATOR_CONFIG = loadConfig()` loads as before.
- **The wizard** renders one number input per `editable: true` entry, using
  `label` and deriving `min` / `max` / `step` from `kind` (`probability` →
  `min 0 max 1 step 0.01`; `rate` → `min 0 step 0.0001`).
- **The detail page** lists the values read-only from the same entries.

The `GeneratorConfig` TS **interface stays hand-written** — a runtime array
can't cleanly produce the nested static type without heavy generics, and an
explicit interface reads better. Schema now lives in **two** places (interface +
registry) instead of four, and adding a field is **one registry line** plus one
interface line.

Rejected alternative: a Zod schema as the single source. The project has no Zod
dependency and the UI metadata (labels, editable, kind) would still need a
companion table — it adds a dependency without removing the second location.

## Data model

Extend `SimulationParameters` with `generatorConfig: GeneratorConfig` (the full
config shape, including non-editable `stepDelaySeconds`). Stored in the existing
`parameters` JSON column — **no DB schema migration**.

```ts
export interface SimulationParameters {
  clockSpeed: ClockSpeed;
  durationSeconds: number;
  usesExistingPopulation: true;
  generatorConfig: GeneratorConfig;
}
```

`parseSimulationParameters(input)` runs `input.generatorConfig` through
`loadConfig()`, which validates and clamps every field, so a malformed value can
never crash generation. Missing fields fall back to registry defaults, so a
create request that omits `generatorConfig` entirely yields the default config.

Backwards-compat: older simulation rows may lack `generatorConfig`. Generation
only runs from the `created` state, but to be safe `generateEvents` falls back to
`GENERATOR_CONFIG` when `parameters.generatorConfig` is absent.

## Threading config into generators (core refactor)

Today each generator reads the module-level singleton `GENERATOR_CONFIG`. To make
config per-run:

1. Add `config: GeneratorConfig` to `GeneratorContext` in
   `generators/types.ts`.
2. Update all five generators to read `ctx.config.X` instead of the singleton:
   `random-death`, `random-birth`, `random-marriage`,
   `random-national-id-reg`, `random-benefit-eligibility`.
3. `generateEvents` builds the context with
   `config: parameters.generatorConfig ?? GENERATOR_CONFIG`.

This also makes the generators fully pure — no hidden module-global state — which
improves testability.

Rejected alternative: dynamically re-reading a mutable global config at generate
time. It can't be per-simulation and keeps hidden global state.

## UI

### Create wizard — `portal/src/app/staff/simulations/page.tsx`

Add a collapsible **"Advanced: event chances"** section (GOV.UK `<details>`
component) inside the "Start new simulation" wizard, below the duration field.

- One labelled number input per `editable` registry entry, initialized from
  `GENERATOR_CONFIG`.
- State held as a `generatorConfig` object; edits update the corresponding path.
- On **Create**, the POST body includes `parameters.generatorConfig`. Left
  untouched, it sends the defaults.
- Keeps the common path clean — most users never open the section.

### Detail screen — `portal/src/app/staff/simulations/[id]/page.tsx`

In the read-only **Parameters** summary list, add rows showing the chances used
for the run (iterated from the registry's `editable` entries against
`simulation.parameters.generatorConfig`), so a run's configuration is visible
after the fact.

## Error handling

- Client: number inputs constrained by `min`/`max`/`step`. No blocking
  client-side validation beyond that — the server is authoritative.
- Server: `loadConfig()` clamps out-of-range and coerces malformed values to
  defaults, so generation always receives a valid config.

## Testing

- **`config.ts`**: `loadConfig()` clamps rates `< 0` to `0`, probabilities
  outside `[0, 1]` into range, and fills missing/malformed fields from registry
  defaults. Registry drives validation (spot-check a `rate` and a `probability`
  field).
- **Generators**: existing unit tests pass an explicit `config` in their
  context (via `GENERATOR_CONFIG` or a custom config) and assert behaviour
  changes with a custom config (e.g. rate 0 → no events).
- **`generateEvents`**: uses `parameters.generatorConfig` when present and falls
  back to `GENERATOR_CONFIG` when absent.
- **`parseSimulationParameters`**: accepts and clamps `generatorConfig`; defaults
  it when omitted.

## Out of scope

- Global / persisted default chances (this is per-simulation only).
- Editing `stepDelaySeconds` from the UI.
- Editing chances after a simulation leaves `created` (generation is one-shot).
