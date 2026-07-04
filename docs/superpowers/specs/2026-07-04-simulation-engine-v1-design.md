# SimulationEngine v1 — Design (Issue #55)

## Context

The simulation feature ships in three layers:

1. **#53 (done)** — UI + a file-backed store (`portal/src/lib/simulations/store.ts`)
   with a state machine: `created → generated → running → stopped/completed`.
   Today `generate`/`start`/`stop` only flip status flags. "Completion" is
   currently *faked* by `resolveCompletedSimulation`, which marks a run complete
   once wall-clock elapsed ≥ `durationSeconds / clockSpeed`.
2. **#54 (open)** — the *Generator*: on "generate", precompute a `SimulationEvents`
   list from the population using `RandomEventGenerator`s.
3. **#55 (this spec)** — the *Engine*: on "start", execute the precomputed events
   at their scheduled real times (POST to the resolved OpenFn webhook URL), then
   mark the simulation `completed`.

This spec covers **#55 only**, plus the minimal shared contract and a stub
generator so the engine is runnable and testable before #54 lands.

## Goals

- Execute a precomputed `SimulationEvent` list, firing each event's POST at its
  scheduled real time.
- Mark the simulation `completed` (or `failed`) when the run finishes; surface
  summary counts as `stats`.
- Support `stop` mid-run.
- Deliver events for real to registered webhooks; skip + log unregistered ones.

## Non-goals (v1)

Explicitly deferred, per the ticket's "in future" note:

- **No crash/restart recovery.** If the portal or worker process dies mid-run,
  the run is abandoned (its status is not automatically reconciled to a terminal
  state). Acceptable for a demo-scale v1.
- **No SimulationLogs.** Only summary counts (`delivered`/`skipped`/`failed`/
  `total`) are recorded, in `record.stats`. Per-event telemetry/logging comes later.
- **No new UI.** The existing #53 detail page already renders status, timers, and
  a stats area; populating `stats` is enough.

## Architecture

Chosen from brainstorming: a **separate worker process**, with **generate-time
webhook resolution** and a **single-writer file discipline** (worker owns its
run-state file; portal owns the simulations store).

```
Portal (Next.js)                         Worker (simulation/ package, tsx)
────────────────                         ─────────────────────────────────
generate route ──► stub generator
   writes .simulations/<id>.events.json
                                    │
start route ──► spawn detached ─────┼──► sim:run <id>
   record.status = "running"        │       reads  <id>.events.json
                                    │       schedules POSTs by real time
                                    │       POSTs to targetUrl (or skip+log)
                                    │       writes <id>.run.json  (owns it)
stop route ──► SIGTERM worker pid ──┘       SIGTERM → status "stopped"

store read ──► reconciles record status/stats FROM <id>.run.json
```

### The shared contract (#54 ↔ #55 seam)

A per-simulation events file is the boundary between the generator and the engine.

- **Path:** `.simulations/<id>.events.json`, relative to the portal working
  directory (alongside the existing `.simulations.json`). Resolved from a base
  dir (`SIM_DATA_DIR`, default `process.cwd()`) so portal and spawned worker
  agree on location.
- **`SimulationEvent`:**

  ```ts
  interface SimulationEvent {
    id: string;              // stable event id
    scheduledMicros: number; // real microseconds after simulation start
    targetKey: string;       // form-webhook registry key (for logging/skip messages)
    targetUrl: string | null;// resolved OpenFn webhook URL at generate-time; null = unregistered
    payload: unknown;        // JSON POST body
  }
  ```

- **Clock speed & duration are baked into `scheduledMicros` by the generator.**
  The engine only honors real-time offsets and never reads `clockSpeed`. Clean
  separation of concerns.
- **Webhook resolution happens at generate-time.** The generator calls the
  existing `resolveFormWebhook(key)` and stores the resulting URL, or `null` if
  no webhook is registered (and no env fallback). The worker stays "dumb": it
  never touches the registry.

### The stub generator (part of #55)

Wired into the existing `POST /api/simulations/[id]/generate` route so the full
create → generate → start → complete flow works before #54 exists.

- Emits a small fixed set of events (e.g. 3 `national-id` POSTs spaced a few
  seconds apart in real time), each with a canned payload matching the
  `national-id` form hook.
- Resolves each event's `targetUrl` via `resolveFormWebhook`.
- Writes `.simulations/<id>.events.json`, then transitions the record to
  `generated` (the store's existing `generateSimulation` behavior).
- Isolated behind a small module so #54 can replace it wholesale without
  touching the engine or the route contract.

### The worker

New command in the `simulation/` package: `sim:run <simulationId>`
(`tsx src/index.ts run <id>`), added to `simulation/package.json` scripts and the
`index.ts` command switch. Spawned **detached** by the portal's start route.

Behavior:

1. Read `.simulations/<id>.events.json`. Sort events by `scheduledMicros`.
2. Record `pid` + `status: "running"` + `startedAt` to `.simulations/<id>.run.json`.
3. For each event, wait until `startWallClock + scheduledMicros/1000` ms, then:
   - `targetUrl === null` → **skip**, increment `skipped`, log.
   - else POST `payload` to `targetUrl`. 2xx → `delivered`. Non-2xx or network
     error → `failed`, log. **The run continues regardless** of any single
     event's outcome.
4. Empty list → complete immediately.
5. On finish: write `status: "completed"`, `completedAt`, and final counts.
6. On `SIGTERM`: stop scheduling further events, write `status: "stopped"`, exit.

The worker resolves file paths from `SIM_DATA_DIR` (passed/inherited from the
portal) so both processes read/write the same directory.

### Portal ↔ worker coordination (single-writer discipline)

The worker **never writes `.simulations.json`** — that avoids racing the portal,
which writes it on every user action. Instead the worker exclusively owns:

- **`.simulations/<id>.run.json`:**

  ```ts
  interface SimulationRunState {
    pid: number;
    status: "running" | "completed" | "stopped" | "failed";
    startedAt: string;
    completedAt?: string;
    delivered: number;
    skipped: number;
    failed: number;
    total: number;
  }
  ```

Portal changes (`portal/src/lib/simulations/store.ts` + routes):

- **`start` route / `startSimulation`:** transition record → `running`
  (`startedAt` set), then spawn the detached worker: `tsx <simulation>/src/index.ts
  run <id>` with `SIM_DATA_DIR` and `cwd` set to the portal working dir.
- **Store reconciliation replaces the wall-clock fake.** Remove
  `resolveCompletedSimulation`; in its place, when reading a simulation whose
  record status is `running`, read `<id>.run.json`:
  - `completed`/`failed`/`stopped` there → reflect that status on the record,
    set the matching timestamp, and copy the counts into `record.stats`.
  - still `running` (or file missing) → leave as `running`.
- **`stop` route / `stopSimulation`:** read `pid` from `run.json`, send
  `SIGTERM`; set record `stopped`. (Worker also writes `stopped` to `run.json`;
  reconciliation stays consistent either way.)
- **`delete`:** also remove `<id>.events.json` and `<id>.run.json`.

## Data flow (happy path)

1. User creates a simulation → record `created`.
2. User clicks Generate → stub generator writes `<id>.events.json`, record
   `generated`.
3. User clicks Start → record `running`, worker spawned.
4. Worker fires each POST at its scheduled real time; writes progress/terminal
   state to `<id>.run.json`.
5. Detail page polls the store; reconciliation surfaces `completed` + `stats`
   when the worker finishes.

## Error handling

- **Unregistered webhook** (`targetUrl === null`): skip, count, log — never fails
  the run.
- **POST failure** (non-2xx / network): count as `failed`, log — never fails the
  run.
- **Missing events file** on start: worker writes `failed` to `run.json` with a
  reason; reconciliation surfaces `failed`.
- **Worker spawn failure** in the start route: return an error from the route;
  record stays `generated` so the user can retry. (Best effort — if the record
  already flipped to `running`, reconciliation will show no `run.json` and the
  run is treated as abandoned per the non-goals.)
- **Malformed `run.json`**: treated as "still running" (missing) rather than
  crashing the store read.

## Testing

- **Unit (worker, injected clock + fetch):**
  - events fire in `scheduledMicros` order at the right offsets;
  - delivery outcomes: skip (`null` url), success (2xx), failure (non-2xx/throw);
  - empty list → immediate completion;
  - `SIGTERM` → `stopped` with partial counts.
- **Unit (store):** reconciliation maps each `run.json` status → record
  status/timestamp/stats; missing/malformed `run.json` leaves `running`.
- **Integration:** stub-generate → start → assert POSTs arrive at a mock webhook
  at the expected times, and the record reconciles to `completed` with correct
  counts.

## Files touched (anticipated)

- `simulation/src/index.ts` — add `run` command.
- `simulation/src/engine/*` (new) — worker: events loader, scheduler, delivery,
  run-state writer.
- `simulation/package.json` — add `sim:run` script.
- `portal/src/lib/simulations/events.ts` (new) — `SimulationEvent` type + events
  file I/O + path resolution (`SIM_DATA_DIR`).
- `portal/src/lib/simulations/run-state.ts` (new) — `SimulationRunState` type +
  read helper.
- `portal/src/lib/simulations/stub-generator.ts` (new) — v1 stub, replaced by #54.
- `portal/src/lib/simulations/store.ts` — remove `resolveCompletedSimulation`,
  add run-state reconciliation; spawn worker on start; SIGTERM on stop; cleanup
  on delete.
- `portal/src/app/api/simulations/[id]/generate/route.ts` — call stub generator.
