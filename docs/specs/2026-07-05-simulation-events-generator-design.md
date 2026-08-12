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

## Persistence & the SQLite migration

A later merge from `main` (`6bc252e`) moved the portal's **mutable, queried,
concurrently-accessed** state off JSON files into SQLite/Drizzle
(`portal/src/lib/db/schema.ts`): the `simulations` lifecycle record, the
`simulation_runs` run-state (worker-owned, heartbeat + counters), and the
`form_webhooks` registry (previously `.form-webhooks.json`).

**The event script was deliberately *not* migrated.** It stays a JSON file at
`.simulations/<id>.events.json`, written by `writeEvents` (`events.ts`) and read
back wholesale by the #55 worker (`simulation/src/engine/events.ts` →
`fs.readFile` + `JSON.parse`). This is the correct scoping, not an oversight:

- The events are **write-once** (generator) and **read-once wholesale** (worker at
  startup) — never mutated, never queried. A database earns its keep on mutable
  or queried state; for an immutable blob it only adds a schema, a migration, and
  couples the worker to the portal's DB.
- The file **is the portal↔worker handoff contract.** Both processes share it by
  path; the worker does not touch the portal's SQLite DB.

**Impact on this generator: none.** `writeEvents` is unchanged, so the orchestrator
is unaffected. `resolveFormWebhook` now reads target URLs from the `form_webhooks`
SQLite table instead of the JSON file, but its signature is identical — the
orchestrator calls it the same way.

**Known scaling boundary (trigger to revisit).** The file model holds only while
two conditions are true, and both are true for v1:

1. The whole event list fits in worker memory (`readEvents` parses the entire
   array at once). At ~200 bytes/event, ~1M events ≈ several hundred MB of heap.
   v1 emits one national-id event per alive citizen, so this is fine — but adding
   generators (death, birth, benefit checks) makes it `population ×
   events-per-citizen`.
2. The engine plays events as one ordered in-memory pass, needing no seek,
   resume-from-checkpoint, or "next N events due before T" query.

When either breaks, migrate to an `events` table indexed on `scheduledMicros`
**and** change the worker to stream/cursor rows — a file-to-DB swap alone would
not fix the memory ceiling, because loading everything at once is the real
bottleneck, not the file format.

## Error handling & edge cases

- **No citizens / Identity unreachable** → orchestrator throws; the route already
  maps errors to 400 and leaves status at `created` (no partial `generated`).
- **`targetKey` resolves to no URL** → event still emitted with `targetUrl: null`;
  the engine already skips these gracefully (`scheduler.ts:23`).
- **Sim shorter than 1 day** → `numDays = 0` → zero events. **Known v1 limitation**
  of the hardcoded `dt`. *Superseded:* generation now walks `daySteps()`, which
  keeps the trailing part-day and scales each generator's per-day rate by the
  fraction of a day it covers, so a sub-day run draws its proportional share
  instead of nothing.
- **Empty event list** is valid — generation succeeds with `[]`.

## Cross-ticket dependency (for #55, not #54)

The engine's delivery loop (`simulation/src/engine/scheduler.ts:28`) POSTs with
only `content-type: application/json`. It does **not** set the
`X-SimDPG-Form: <targetKey>` header that the interactive form path
(`form-submission.ts`) sends. If OpenFn workflows key off that header, the engine
won't identify the form. #54 emits `targetKey` on every event regardless; whether
the engine forwards it as a header is a #55 decision. Flagged here for tracking.

## End-to-end execution flow

How a generated event travels from a button click to an HTTP delivery, across
both processes. #54 owns steps 1–3; #55 owns 4–6.

1. **User clicks Generate** → `POST /api/simulations/[id]/generate`
   (`route.ts`). The route loads the `SimulationRecord` from SQLite, rejects
   anything not in `created` (→ 409, guards against overwriting an existing
   script), then calls `generateEvents(id, parameters)`.
2. **Orchestrator runs** (`generate-events.ts`): fetches alive citizens from the
   Identity system, runs every generator in `REGISTRY` over a
   `GeneratorContext {citizens, dtSeconds: 86_400, durationSeconds, random}`,
   resolves each `targetKey → targetUrl` via `resolveFormWebhook` (SQLite
   `form_webhooks`, cached per key), converts sim-seconds → `scheduledMicros`,
   assigns a `randomUUID` per event, sorts ascending, and `writeEvents` persists
   the array to `.simulations/<id>.events.json`.
3. **Transition** → `generateSimulation(id)` flips the record `created →
   generated` in SQLite. Route returns the updated simulation.
4. **User clicks Start** → the start route spawns the worker process with
   `SIM_DATA_DIR` set so it resolves the same `.simulations/` directory, and
   writes a `simulation_runs` row (`running`).
5. **Worker plays the script** (`simulation/src/engine/worker.ts`):
   `readEvents(id)` loads the whole JSON array into memory, then the scheduler
   walks it in `scheduledMicros` order, sleeping between events (scaled by real
   time) and POSTing each `payload` to its `targetUrl`. Events with
   `targetUrl: null` are skipped. Counts (delivered/skipped/failed) heartbeat
   into the `simulation_runs` row.
6. **Completion** → worker writes the terminal status + stats; the record moves
   to `completed` (or `stopped`/`failed`). No read-time reconciliation — whoever
   changes the status writes it.

## Testing

- **Generator unit tests** (pure, deterministic via injected `random`):
  - probability boundary — roll just below vs. just above `NATIONAL_ID_DAILY_PROB`;
  - one-registration-per-citizen cap (`break` after first hit);
  - payload shape matches the `national-id` contract, including address fallback
    when `addresses` is absent;
  - `numDays = 0` (sub-day sim) produces zero events. *Superseded:* a sub-day sim
    now rolls once against the day-probability scaled by the part-day.
- **Orchestrator test** (stub Identity client + `resolveFormWebhook`):
  - events sorted ascending by `scheduledMicros`;
  - `scheduledMicros === scheduledSimSeconds / clockSpeed * 1e6`;
  - `id` assigned per event; `targetUrl` resolved from the `form_webhooks`
    registry (SQLite-backed via `resolveFormWebhook`; see Persistence);
  - alive-only filtering of citizens;
  - empty population → succeeds with `[]`.

### Manual testing (full stack)

Exercises the real Identity system, the SQLite webhook registry, and the guarded
route end to end. From repo root: `npm install` (drizzle deps), then
`npm run setup` (seeds system DBs including citizens) and `npm run dev` (boots
identity:3001 … portal:3000).

1. In the portal staff area, register the `national-id` form hook against a URL
   (e.g. a webhook.site bucket). This writes the `form_webhooks` **SQLite table**,
   not `.form-webhooks.json`. Without it, `targetUrl` resolves to `null` (still
   valid — the worker skips those events).
2. Create a simulation via the wizard (#53), then click **Generate**.
3. Inspect the persisted script:
   `cat portal/.simulations/<id>.events.json | jq 'length, .[0]'` — expect
   `national-id` registrations, sorted by `scheduledMicros`, one per alive
   citizen.
4. Re-generate guard: a second `POST /api/simulations/<id>/generate` on an
   already-generated sim returns **409** and leaves the events file untouched
   (`route.ts`).
5. (Optional) Click **Start** and watch the worker POST each payload to the
   registered URL in `scheduledMicros` order — the #55 playback half of the flow.

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
