# Stochastic system behaviour — design

**Ask:** give every system the ability to behave stochastically — latency,
failures, rate limiting — configured with the same interface as
[openfn-mocker](https://github.com/brandonjackson/openfn-mocker#simulating-stochastic-behavior),
defined once per simulation and applied to all systems, with smart presets on the
simulation config screen, off by default, and back to default when a run ends.

## Problem

Today all seven systems answer instantly and never fail. Workflows built against
them therefore never exercise the paths that matter most in production: retries,
backoff, timeouts, partial failure, 429 handling. The mocker can already inject
this behaviour for mocked endpoints; SimDPG's own systems could not, so a
workflow that passes here can still fall over against a real registry.

## Decisions

- **Same config keys as the mocker.** `latency: { mean_ms, stddev_ms, min_ms,
  max_ms }`, `error_rate` / `error_status`, `rate_limit: { max, window_ms,
  status }`, with the same semantics: a delay drawn from N(mean, stddev) clamped
  to [min, max]; an `error_rate` chance of a synthetic failure instead of
  reaching the handler; fixed-window throttling past `max` per `window_ms`. A
  config written for one is readable by the other.
- **Off by default.** Nothing changes until something applies a config.
- **Defined once per simulation, applied to all seven systems.** The block lives
  in `SimulationParameters.behavior`, so a run is reproducible and
  self-contained, exactly like `clockSpeed` and `generatorConfig`. Per-system
  variation is possible (each system's endpoint is independent) but is not what
  the simulation screen offers.
- **The worker owns the lifetime.** It applies the config just before the first
  event is delivered and clears it in a `finally`, so completed, stopped, and
  crashed runs all end with the systems back to normal.
- **Three independent safety nets** for "the run is over, stop being faulty":
  1. the worker's `finally` (the normal path);
  2. the portal's stop route also clears, for the case where the worker is
     already gone;
  3. every system self-expires the config at `expires_at`, which the worker sets
     to the run's scheduled end plus five minutes. A `kill -9` cannot leave the
     systems degraded, and a restarted system comes back off (the config is
     in-memory on purpose).
- **Presets, not just numbers.** The mocker documents raw knobs; the config
  screen offers named profiles (below) plus Custom, because "what would a flaky
  registry do to this workflow" is the question staff actually have.

## Two departures from the mocker's config, both supersets

- `max_ms` accepts (and defaults to) `null` rather than `∞`: this config travels
  as JSON, which has no Infinity. `null` means "no upper clamp"; a number clamps
  identically.
- Values are clamped, not rejected — `error_rate: 2` becomes `1` — matching how
  the portal's generator config already treats its numbers. A malformed field
  falls back to off rather than failing a run.

## Architecture

```
Simulation record (portal DB)
  parameters.behavior ──┐
                        │  worker, at run start: PUT /admin/behavior  (+ expires_at)
                        │  worker, at run end:   DELETE /admin/behavior
                        ▼
        ┌──────────── all seven systems ────────────┐
        │  behaviorMiddleware   →  latency / errors / throttling
        │  /admin/behavior      →  GET / PUT / DELETE
        └───────────────────────────────────────────┘
                        ▲
                        │  portal: GET (live state), DELETE (manual reset)
              /api/systems/behavior
```

### `@simdpg/system-kit`

Split in two so the portal's browser bundle can read the config vocabulary
without pulling in express:

- `behavior.ts` — dependency-free: the `BehaviorConfig` shape, the
  `BEHAVIOR_FIELDS` descriptor registry (single source of truth for defaults,
  clamping, labels, and hints — same pattern as `GENERATOR_CONFIG_FIELDS`),
  `parseBehavior`, `BEHAVIOR_PRESETS`, `describeBehavior`, and `sampleLatencyMs`
  (Box–Muller). Exported as the package subpath `@simdpg/system-kit/behavior`.
- `behavior-runtime.ts` — `BehaviorController` (current config, expiry,
  fixed-window rate-limit state, counters), `behaviorMiddleware`,
  `behaviorRouter`, and `createBehavior()` which wires all three together.

Each system adds two lines: `app.use(behavior.middleware)` before its routes and
`app.use("/admin/behavior", behavior.router)`.

### Request handling order

1. **Throttled?** Answer immediately with `rate_limit.status` — no latency first,
   so a load test sees a clean, fast rejection.
2. **Latency.** Sleep for the sampled delay.
3. **Failure?** With probability `error_rate`, answer `error_status` instead of
   calling the handler — after the latency, because a real failing call costs
   time too.

Injected responses use the systems' existing DCI error envelope rather than the
mocker's bare `{ error, injected }` body, so an OpenFn job's error handling needs
no special case. They are identifiable by `details.injected: true`, the
`X-Simdpg-Injected: failure | rate-limit` header, and `Retry-After` on a 429.
Delayed responses carry `X-Simdpg-Behavior-Delay-Ms`.

### What is never injected

`/health`, `/docs`, `/openapi.yaml`, and the whole `/admin` prefix. Two reasons:
a 100%-error config must not lock out the endpoint that clears it, and platform
health checks plus the staff pages (population stats, webhook registration)
should not go flaky just because a run is in progress.

## Presets

| Preset | What it rehearses |
|---|---|
| **Off** (default) | Systems respond normally. |
| **Realistic** | 200 ms ± 60 ms, 0.5% 503s — healthy production on a good day. |
| **Slow** | 1200 ms ± 400 ms, 1% 503s — congested or legacy systems. |
| **Flaky** | 400 ms ± 250 ms, 10% 503s — retry and error handling. |
| **Rate limited** | 150 ms ± 50 ms, 20 req/s then 429 — deterministic, so this is the one for load tests. |
| **Overloaded** | 2000 ms ± 800 ms, 5% 503s, 10 req/s then 429 — systems in trouble. |

Custom starts from whichever preset was selected and exposes every field. A
config that matches a preset is labelled with its name wherever a run is shown;
a hand-edited one reads as "Custom".

## Beyond a simulation

`SIMDPG_BEHAVIOR_PRESET` and `SIMDPG_BEHAVIOR` (JSON, merged over the preset)
apply a config at startup, for a deployed system that should be permanently
degraded. `PUT /admin/behavior` also accepts `{ "preset": "flaky" }` with
per-field overrides, so a single system can be degraded by hand from curl.

## Testing

- `packages/system-kit`: parsing and clamping, preset round-trips, latency
  sampling and clamping, controller expiry, fixed-window rollover, middleware
  outcomes (delay / injected failure / 429 / skipped paths), env bootstrap.
- `portal`: `behavior` defaults to off in `parseSimulationParameters` and clamps
  a hand-edited block; the fan-out PUTs/DELETEs to every system and reports a
  failing system without failing the rest.
- `simulation`: the expiry deadline covers the schedule plus grace; apply/clear
  hit all seven systems and tolerate one being down.
- End-to-end (manual, see TEST.md §13): applied to 7/7 systems at run start,
  visible latency and 429s on live calls, counters moving on the run's detail
  page, cleared on 7/7 when the run is stopped.
