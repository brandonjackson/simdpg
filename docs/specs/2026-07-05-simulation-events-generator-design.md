# SimulationEvents Generator (#54) — Design

**Status:** Approved for planning
**Date:** 2026-07-05
**Related:** #53 (simulation screens, done), #55 (SimulationEngine v1, in progress)

## Purpose

When the user clicks **Generate** on a simulation, precompute the full "script" of
everything that will happen over the run: a flat, timestamped list of
`SimulationEvent`s. All randomness happens up front, here. The engine (#55) just
plays the list back at the right times.

This ticket replaces the placeholder `stub-generator.ts` wholesale with a real,
pluggable generator framework and one concrete generator.

## Scope

**In scope**
- A pluggable `RandomEventGenerator` framework (interface + registry).
- One concrete generator: `randomNationalIdReg`, targeting the already-registered
  `national-id` webhook.
- An orchestrator that fetches shared data, runs the generators, converts their
  output into engine-ready `SimulationEvent`s, and persists them via the existing
  `writeEvents` contract.

**Out of scope (future tickets)**
- Making `dt` configurable (hardcoded to 1 day here — see Decisions).
- Additional generators (death, birth, birthday, benefit eligibility, …). The
  framework leaves room for these; none ship in #54.
- Seeded/reproducible randomness (uses raw `Math.random`, matching
  `population/generator.ts`).
- Engine-side delivery concerns (headers, retries) — those belong to #55.

## Key decisions

- **`dt` = 1 day (86,400 sim-seconds), hardcoded.** The ticket lists `dt` as a
  wizard input, but #53 explicitly deferred the sample-rate parameter. We
  hardcode 1 day for v1 (matches the ticket's per-day probability example) and
  leave it configurable later. `dt` is a *generation-time* concept (resolution of
  the generated timeline) and is unrelated to `clockSpeed`, which is a *run-time*
  concept (how fast the engine plays events back).
- **`durationSeconds` is simulation time**, confirmed from the wizard
  (`staff/simulations/page.tsx`: label "Duration in simulation time"; real
  duration is derived as `durationSeconds / clockSpeed`).
- **One generator, targeting a real webhook.** `national-id` is the one webhook
  key that is registered and working today (the stub already posts to it), so a
  national-ID registration generator proves the whole
  create → generate → start → complete pipeline end to end without inventing a new
  webhook.
- **Model: daily probability per citizen.** Each alive citizen rolls once per
  simulated day; on a hit, emit one registration event. This reuses the ticket's
  `RandomDeath` "roll each day" math directly.

## Architecture & data flow

All IO/async lives in the orchestrator. Generators are pure, synchronous
functions of their context — no webhooks, no clock speed, no network — which
makes them trivially unit-testable.

```
POST /api/simulations/[id]/generate
  └─ generateEvents(id)                     ← orchestrator (only IO/async here)
       1. load SimulationRecord → params {clockSpeed, durationSeconds}
       2. fetch shared data:
            citizens = IdentityClient.listCitizens()   (filter status === "alive")
       3. build GeneratorContext {citizens, dtSeconds: 86_400,
                                  durationSeconds, random}
       4. for each generator in REGISTRY: gen.generate(ctx) → GeneratedEvent[]
       5. resolve targetKey → targetUrl (resolveFormWebhook, once per key)
          convert simSeconds → scheduledMicros via clockSpeed
          assign id (randomUUID), flatten, sort by scheduledMicros
       6. writeEvents(id, events)            ← existing contract, unchanged
  └─ generateSimulation(id)                 ← existing created→generated transition
```

## Types & the generator interface

```ts
// Pure sim-time event, emitted by a generator.
interface GeneratedEvent {
  scheduledSimSeconds: number;  // seconds after sim start
  targetKey: string;            // must be a FORM_HOOKS key
  payload: unknown;             // matches that hook's payload contract
}

interface GeneratorContext {
  citizens: Citizen[];          // alive only
  dtSeconds: number;            // 86_400 (1 day, hardcoded for v1)
  durationSeconds: number;      // sim-time window
  random: () => number;         // defaults to Math.random; injectable for tests
}

interface RandomEventGenerator {
  key: string;                  // e.g. "random-national-id-reg"
  generate(ctx: GeneratorContext): GeneratedEvent[];
}

const REGISTRY: RandomEventGenerator[] = [randomNationalIdReg];
```

The `random` injection is the one deliberate seam: it keeps generators pure and
lets tests feed a deterministic sequence. No seeded-PRNG infrastructure for v1.

## The generator: `randomNationalIdReg`

Per-day roll (the `RandomDeath` shape from the ticket):

```
numDays = floor(durationSeconds / dtSeconds)
for each citizen (alive):
  for day in 0 .. numDays-1:
    if random() < NATIONAL_ID_DAILY_PROB:
      simSeconds = day * 86_400 + floor(random() * 86_400)  // random moment in the day
      emit { scheduledSimSeconds: simSeconds,
             targetKey: "national-id",
             payload: <national-id payload> }
      break   // one registration per citizen
```

- **`targetKey`:** `"national-id"`.
- **Cap:** one registration per citizen (`break` on first hit).
- **`NATIONAL_ID_DAILY_PROB`:** a module-level constant, chosen for observability
  (produces a visible handful of events for a typical population/duration), NOT
  for demographic realism. Documented as a tuning knob.
- **Timing:** events land at a random moment within the hit day, so they don't all
  stack at midnight. All randomness is resolved up front, consistent with the
  ticket's philosophy.

### Payload (matches the `national-id` FORM_HOOKS contract)

Built from the real citizen record (`Citizen` from `@simdpg/api-clients`):

```
{
  given_name,      // citizen.given_name
  family_name,     // citizen.family_name
  date_of_birth,   // citizen.date_of_birth
  sex,             // citizen.sex
  address_line_1,  // citizen.addresses?.[0]?.line_1
  city,            // citizen.addresses?.[0]?.city
  postal_code,     // citizen.addresses?.[0]?.postal_code
  email,           // citizen.email
  phone_number,    // citizen.phone_number
}
```

Missing address fields fall back to empty strings (a citizen may have no
`addresses`).

## Time & magnitude notes

- `scheduledMicros = (scheduledSimSeconds / clockSpeed) * 1_000_000`.
- Value sizes are safe: `scheduledSimSeconds` maxes at `durationSeconds`; even a
  100-year sim is ~3.15e9, seven orders of magnitude below
  `Number.MAX_SAFE_INTEGER` (9.007e15). `scheduledMicros` is smaller still because
  `clockSpeed` divides it down.
- **Cost lever:** the generator loops `numDays × numCitizens` times. The coarse
  `dt` (1 day) is what keeps this cheap; a finer `dt` would multiply the loop. Fine
  for v1 (small populations, short sims). Whoever makes `dt` configurable later
  should know this is the scaling cost.

## Error handling & edge cases

- **No citizens / Identity unreachable** → orchestrator throws; the route already
  maps errors to 400 and leaves status at `created` (no partial `generated`).
- **`targetKey` resolves to no URL** → event still emitted with `targetUrl: null`;
  the engine already skips these gracefully (`scheduler.ts:23`).
- **Sim shorter than 1 day** → `numDays = 0` → zero events. **Known v1 limitation**
  of the hardcoded `dt`.
- **Empty event list** is valid — generation succeeds with `[]`.

## Cross-ticket dependency (for #55, not #54)

The engine's delivery loop (`simulation/src/engine/scheduler.ts:28`) POSTs with
only `content-type: application/json`. It does **not** set the
`X-SimDPG-Form: <targetKey>` header that the interactive form path
(`form-submission.ts`) sends. If OpenFn workflows key off that header, the engine
won't identify the form. #54 emits `targetKey` on every event regardless; whether
the engine forwards it as a header is a #55 decision. Flagged here for tracking.

## Testing

- **Generator unit tests** (pure, deterministic via injected `random`):
  - probability boundary — roll just below vs. just above `NATIONAL_ID_DAILY_PROB`;
  - one-registration-per-citizen cap (`break` after first hit);
  - payload shape matches the `national-id` contract, including address fallback
    when `addresses` is absent;
  - `numDays = 0` (sub-day sim) produces zero events.
- **Orchestrator test** (stub Identity client + `resolveFormWebhook`):
  - events sorted ascending by `scheduledMicros`;
  - `scheduledMicros === scheduledSimSeconds / clockSpeed * 1e6`;
  - `id` assigned per event; `targetUrl` resolved from the registry;
  - alive-only filtering of citizens;
  - empty population → succeeds with `[]`.

## Files

**New**
- `portal/src/lib/simulations/generators/types.ts` — `GeneratedEvent`,
  `GeneratorContext`, `RandomEventGenerator`.
- `portal/src/lib/simulations/generators/random-national-id-reg.ts` — the generator
  + `NATIONAL_ID_DAILY_PROB`.
- `portal/src/lib/simulations/generators/index.ts` — the `REGISTRY`.
- `portal/src/lib/simulations/generate-events.ts` — the orchestrator.
- Tests alongside the above.

**Delete**
- `portal/src/lib/simulations/stub-generator.ts`
- `portal/src/lib/simulations/stub-generator.test.ts`

**Edit**
- `portal/src/app/api/simulations/[id]/generate/route.ts` — call `generateEvents`
  instead of `generateStubEvents`.

**Unchanged**
- `portal/src/lib/simulations/events.ts` (`SimulationEvent` + `writeEvents`).
- All of the #55 engine under `simulation/`.
