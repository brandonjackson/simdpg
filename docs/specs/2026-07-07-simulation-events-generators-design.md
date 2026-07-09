# SimulationEvents Generators — Design (#72)

**Date:** 2026-07-07
**Branch:** `54-simulationevents-generator`
**Issue:** #72 — SimulationEvents Generator workflow plugins

## Goal

In #54 a sample `RandomEventGenerator` (`randomNationalIdReg`) was built for
national-ID registration. This ticket adds the remaining generators so a
simulation exercises the other citizen-facing workflows:

1. `RandomDeath` — Register Death workflow
2. `RandomBirth` — Register Birth workflow
3. `RandomMarriage` — Register Marriage workflow
4. `RandomCheckBenefitEligibility` — Check Benefit Eligibility workflow (3 incremental steps)

Additionally, **all random weights become a configurable JSON asset** rather
than inline constants, so rates can be tuned without editing generator code.

## Background: the generator/scheduler model

- A `RandomEventGenerator` (`portal/src/lib/simulations/generators/types.ts`) is
  **pure and synchronous**: given a `GeneratorContext` (alive citizens,
  `dtSeconds`, `durationSeconds`, injectable `random`) it returns
  `GeneratedEvent[]`. Each event has `scheduledSimSeconds`, a `targetKey`
  (a `FORM_HOOKS` key), and a static `payload`.
- `generate-events.ts` is the only IO boundary: it lists alive citizens,
  resolves each `targetKey` to a URL, and persists sorted `SimulationEvent`s.
- The **scheduler is fire-and-forget** (`simulation/src/engine/scheduler.ts`):
  it POSTs `event.payload` to `event.targetUrl`, checks `res.ok`, and
  **discards the response body**. There is no mechanism to thread one step's
  response into a later step's payload.

This last point constrains the two multi-step workflows (death, benefits):
any step whose payload depends on a *previous step's response* cannot be
generated ahead of time.

### Form-hook targets (already defined in `form-hooks.ts`)

| Workflow | `targetKey`(s) | Payload contract |
|---|---|---|
| Death | `death-registration-lookup`, `death-registration-preview`, `death-registration-confirm` | 1: `{national_id}` · 2: `{citizen_data, userInput:{dateOfDeath,placeOfDeath,causeOfDeath}}` · 3: preview response |
| Birth | `birth-registration` | `{mother_national_id, father_national_id?, given_name, family_name, date_of_birth, sex, place_of_birth}` |
| Marriage | `marriage-registration` | `{spouse_1_national_id, spouse_2_national_id, date_of_marriage, place_of_marriage}` |
| Benefits | `benefit-eligibility-lookup`, `benefit-eligibility-check`, `benefit-eligibility-enrol` | 1: `{national_id}` · 2 & 3: `{citizen_id, program_id}` |

## Architecture

### 1. Configurable weights asset

New files under `portal/src/lib/simulations/generators/`:

- **`config.json`** — the single source of truth for all tunables.
- **`config.ts`** — a typed loader that reads and validates `config.json`,
  applying defaults for any missing field so a malformed or absent file never
  crashes generation. Exposes a typed `GENERATOR_CONFIG` object.

```jsonc
{
  // Two arrival models (see "Arrival models"):
  //  - one-time geometric per citizen (dailyProbPerCitizen): national ID only
  //  - steady daily-count (dailyRatePerPopulation): death, birth, marriage,
  //    benefits — expected events/day = rate × pool size.
  "nationalId": { "dailyProbPerCitizen": 0.02 },
  "death": {
    "dailyRatePerPopulation": 0.000001, // ~0.0001%/day per the issue example
    "stepDelaySeconds": 300             // gap between lookup and preview events
  },
  "birth": {
    "dailyRatePerPopulation": 0.00005  // ~350k births/day per 7B, per the issue
  },
  "marriage": {
    "dailyRatePerPopulation": 0.0000015
  },
  "benefits": {
    "dailyRatePerPopulation": 0.00001,
    "chainProbabilities": { "toStep2": 0.7, "toStep3": 0.5 },
    "stepDelaySeconds": 300
  }
}
```

Defaults are tuned toward *observability at typical sim scale* (like the
existing `0.02` national-ID value), not demographic realism; the issue's
example formulas are the documented starting points and live here so they can
be raised/lowered freely.

`randomNationalIdReg` is refactored to read `nationalId.dailyProbPerCitizen`
from the loader instead of its inline `NATIONAL_ID_DAILY_PROB` constant, keeping
one source of truth. Its **arrival model is unchanged** (one-time geometric per
citizen — see "Arrival models").

### 2. Program IDs for benefits (context extension)

Benefit steps 2 and 3 need a `program_id`. Program IDs are **non-deterministic
UUIDs generated at seed time** (`systems/benefits/src/db/seed.ts`), so they
cannot be hardcoded in `config.json`. Instead they are fetched at generate-time
(the same IO boundary that already lists citizens):

- Extend `GeneratorContext` with `programs: Program[]` (active benefit
  programmes). Empty for generators that don't need them.
- In `generate-events.ts`, add a `listPrograms?` dep defaulting to
  `new BenefitsClient(SYSTEM_URLS.benefits).getPrograms("active")`. Fetch once,
  pass into every generator's context.
- `RandomCheckBenefitEligibility` picks a `program_id` from `ctx.programs` via
  the injected `random`. If `ctx.programs` is empty it emits **step 1 only**
  (nothing to check/enrol against).

This keeps generators pure (all IO stays in `generate-events.ts`) while giving
them real, live program IDs — faithful to "from config/seed program IDs".

### 3. Reused payload-filler pools

The legacy standalone simulator (`simulation/src/names.ts`,
`simulation/src/events/death.ts`) already defines realistic pools:
`maleGivenNames`, `femaleGivenNames`, `familyNames`, `cityNames`, and a
`CAUSES_OF_DEATH` list. Rather than duplicate, the generators import/reuse these
(or a small shared copy under `generators/` if a cross-package import is
undesirable — decided at implementation time). All sampling uses the injected
`random` so generators stay deterministically testable.

### 4. Arrival models

Two arrival models govern *when* events fire over the run:

- **One-time geometric per citizen** — `random-national-id-reg.ts` **only**.
  Each citizen rolls a daily Bernoulli (`dailyProbPerCitizen`) and registers on
  the first success (`break`). Arrivals are front-loaded (heaviest day 0, decay
  ≈`0.98×`/day) and each citizen fires at most once. This is left **unchanged** —
  "everyone eventually registers, mostly early" is acceptable for ID uptake.

- **Steady daily-count (flow)** — death, birth, marriage, benefits. For each
  day, `expected = dailyRatePerPopulation × pool`; draw an integer count (floor
  of `expected` plus a Bernoulli on the fractional remainder, using `random`),
  then sample that many entities **for that day**. Arrivals are **uniform**
  across the run — no front-loading. Two variants:
  - **Once-per-entity (death):** sample from a *draining* pool of citizens not
    yet selected in this run, so a citizen dies at most once and death timing is
    spread evenly. When the pool empties, no further deaths.
  - **Recurring (birth, marriage, benefits):** sample fresh each day
    (recurrence across days is fine — a citizen may be checked for benefits
    twice, mothers/spouses are drawn per day).

All sampling uses the injected `random`, so every generator stays
deterministically testable.

### 5. Generators

Each is a new file mirroring `random-national-id-reg.ts`, registered in
`generators/index.ts`'s `REGISTRY`.

#### `random-death.ts` — `RandomDeath`

**Steady daily-count, once-per-citizen** (draining pool). For each day, draw a
death count from `config.death.dailyRatePerPopulation × aliveRemaining`, and
sample that many citizens from those not yet selected this run. Deaths spread
uniformly across the window (no early front-loading). For each dying citizen,
emit **two** `GeneratedEvent`s:

1. `death-registration-lookup` — payload `{national_id: citizen.national_id}`,
   at `scheduledSimSeconds = day*dt + offset`.
2. `death-registration-preview` — payload
   `{citizen_data: <the full Citizen>, userInput: {dateOfDeath, placeOfDeath, causeOfDeath}}`,
   at the lookup time `+ config.death.stepDelaySeconds`.
   - `dateOfDeath` = the event's sim-day date.
   - `placeOfDeath` = sampled from `cityNames`.
   - `causeOfDeath` = sampled from `CAUSES_OF_DEATH`.

> **`RandomDeath` deliberately does NOT emit step 3 (`death-registration-confirm`).**
> The confirm payload is the *response* of the preview step (computed
> `enrollment_data`, `payment_data`, etc.), which the fire-and-forget scheduler
> discards and the generator cannot fabricate at generate-time. Exercising the
> full cascade would require threading step responses through the shared engine
> — out of scope for this ticket. **This limitation must be stated in the
> generator's file-level doc comment and in the generators README/spec.**

#### `random-birth.ts` — `RandomBirth`

**Steady daily-count, recurring.** For each day, expected births =
`config.birth.dailyRatePerPopulation × population`; draw a per-day integer count
(floor of expected plus a Bernoulli on the fractional remainder, using
`random`). For each birth:

- Pick a random alive adult **female** as mother → `mother_national_id`.
- Optionally pick a father (alive adult male) — included when present.
- Newborn `given_name` sampled by a random sex from the given-name pools;
  `family_name` inherited from the mother; `date_of_birth` = the sim-day date;
  `place_of_birth` sampled from `cityNames`.

Emit one `birth-registration` event per birth. If no eligible mother exists,
emit nothing that day.

#### `random-marriage.ts` — `RandomMarriage`

**Steady daily-count, recurring.** Per-day marriage count derived from
`config.marriage.dailyRatePerPopulation × population` (same draw as birth). Each
marriage pairs **two distinct random alive adults** (no opposite-sex constraint
— simpler; revisit if realism is wanted). Emit one `marriage-registration`
event:
`{spouse_1_national_id, spouse_2_national_id, date_of_marriage: <sim-day>, place_of_marriage: <cityNames>}`.

#### `random-benefit-eligibility.ts` — `RandomCheckBenefitEligibility`

**Steady daily-count, recurring.** For each day, draw a count from
`config.benefits.dailyRatePerPopulation × population` and sample that many
citizens (recurrence across days is fine — a citizen may check more than once).
For each sampled citizen, produce the issue's incremental pattern (`1`, `1→2`,
or `1→2→3`):

1. Always emit `benefit-eligibility-lookup` — `{national_id: citizen.national_id}`.
2. With probability `chainProbabilities.toStep2`, also emit
   `benefit-eligibility-check` — `{citizen_id: citizen.id, program_id}` at
   `+ stepDelaySeconds`.
3. Only if step 2 fired, with probability `chainProbabilities.toStep3`, also
   emit `benefit-eligibility-enrol` — `{citizen_id: citizen.id, program_id}` at
   `+ 2*stepDelaySeconds`.

`program_id` is chosen (per sampled citizen) from `ctx.programs`. If
`ctx.programs` is empty, only step 1 is emitted.

### 6. Wiring changes

- `types.ts` — add `programs: Program[]` to `GeneratorContext`.
- `generate-events.ts` — add `listPrograms?` dep, fetch active programs, pass
  `programs` into every generator context.
- `index.ts` — extend `REGISTRY` with the four new generators.
- `random-national-id-reg.ts` — read `nationalId.dailyProbPerCitizen` from
  `config.ts` (model unchanged).

## Testing

Vitest per generator, following the existing seeded-`random` (`seq([...])`)
pattern in `random-national-id-reg.test.ts`:

- **Death**: daily-count draw math; each death emits a 2-event lookup+preview
  pair with correct `stepDelaySeconds` stagger; `never` emits confirm; payload
  shape (national_id, citizen_data, userInput); a citizen is selected at most
  once (draining pool); deaths spread across days (not front-loaded);
  deterministic under seeded random.
- **Birth**: expected-count math for a given population/duration; mother is an
  alive adult female; family_name inherited; empty output with no eligible
  mothers; deterministic under seeded random.
- **Marriage**: two distinct spouses; count math; payload shape.
- **Benefits**: step-1-only / 1→2 / 1→2→3 branches driven by seeded rolls;
  `program_id` drawn from `ctx.programs`; step-1-only when `programs` is empty;
  stagger correctness.
- **Config loader**: applies defaults on missing/malformed fields; parses a
  valid file.
- **`generate-events`**: passes `programs` into contexts; `listPrograms`
  default is wired.

## Out of scope

- Emitting `death-registration-confirm` (step 3) or
  `benefit-eligibility` beyond what static payloads allow — would need
  response-threading in the shared engine.
- **Cross-generator death consistency.** Generators stay pure and independent;
  each receives the same alive-at-generate-time citizen list. Nothing prevents a
  marriage/birth/benefit event from being scheduled for a citizen *after* the
  sim-time at which `RandomDeath` kills them. A future ticket can add a
  post-generation filter in `generate-events.ts` (drop events keyed to a citizen
  after their earliest death event) without coupling the generators. Deferred.
- Demographic realism / age-weighted rates (defaults are observability-tuned;
  legacy age-weighting in `simulation/src/events/` is not ported here).
- Making `dtSeconds` configurable (still hardcoded to 1 day per #54).
- Any new portal forms or `/api/apply` routes (all target hooks already exist).
