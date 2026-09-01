# Queued event delivery

**Status:** approved, not yet implemented
**Issue:** #85 — synchronous delivery of requests causes longer-than-expected simulation times

## Problem

A simulation run must sustain roughly **10,000 event deliveries per second**. The
target shape is a simulated day compressed into a second of wall-clock time, so a
day containing 10,000 events plays out in one second with microsecond spacing
between events. Runs are 10k–100k events, giving a wall-clock span of 1–10s.

Today a single spawned worker process performs every delivery itself.
`runEvents` dispatches POSTs concurrently, capped at `SIM_MAX_CONCURRENCY`
(default 20), with `Promise.race` backpressure. That fixed the earlier serial
delivery collapse, but it does not reach 10k/s, and raising the cap does not get
there either.

### Measurement

A single Node process posting to a mock webhook with 200ms latency:

| Concurrency cap | Result |
|---|---|
| 500 | 20,000 sent in 11.21s = **1,784 req/s** (peak 500, 0 failed) |
| 2,000 | **FATAL: JS heap out of memory** (~2GB) at ~12s |
| 5,000 | same OOM |

Throughput is sublinear (cap 500 at 200ms should theoretically yield 2,500/s and
delivered 1,784/s), and raising the cap causes heap exhaustion rather than more
throughput.

Caveat on the measurement: the mock server ran in the same process as the
client, so both shared one heap and the OOM threshold is pessimistic. A
client-only process would get somewhat further. The order of magnitude is the
usable number: **~1–2k deliveries/sec per Node process**, so 10k/s needs roughly
6–10 processes.

### What is not the bottleneck

Events do not POST into the seven SQLite systems. `targetUrl` resolves via
`resolveTarget` → the `form_webhooks` table, which holds **OpenFn workflow
webhook trigger URLs** (see `portal/src/lib/form-webhooks.ts`). Delivery is pure
HTTP fan-out to a handful of external origins, so the systems' single-writer
SQLite does not constrain the run. The constraint is the sending process, plus
whatever rate OpenFn's webhook ingestion will accept.

## Goal

Distribute delivery across a pool of worker processes so throughput scales with
pool size instead of being bounded by one process's heap and event loop.

Explicit non-goals for this phase: architectural realism, delivery durability
guarantees, and decoupling the portal from process spawning. Those may follow;
they are not what this change is for.

## Design

### Topology

```
Portal (Next.js)
  └─ spawns ──► Scheduler (1 per run)          ┌──► Worker 1 ─┐
                  ├─ reads events.json         │              │
                  ├─ enqueues at wall-clock ───┼──► Worker 2 ─┼──► OpenFn
                  │     time  ──► Redis queue  │              │    webhooks
                  ├─ flushes counters ──► SQLite    ...       │
                  └─ writes terminal state     └──► Worker N ─┘
```

### Components

**Scheduler** — one short-lived process per run, spawned by the portal exactly as
today (`spawnWorker` in `portal/src/lib/simulations/store.ts` keeps its shape,
including the stdio tee to the per-simulation log file). It owns the clock and
nothing else: read events, enqueue each at its scheduled moment, aggregate
counters, write terminal state.

**Workers** — long-lived, stateless, N containers. A BullMQ `Worker` with
internal concurrency ~200. The job handler is the existing `deliver()` moved
verbatim into a shared module: the `AbortController` timeout, the null-`targetUrl`
skip, and the never-throws contract all carry over unchanged. One pool serves all
runs; jobs carry their `simulationId`.

**Redis** — a single queue `sim-deliveries` (BullMQ forbids `:` in a queue
name — it's the internal key separator — so the hyphen form is used); counters
at `sim:run:<id>:{delivered,skipped,failed}`; a stop flag at
`sim:run:<id>:stopped`. The counter and stop-flag keys are plain Redis keys, not
queue names, so they keep the `:` convention.

### Transport choice

**BullMQ over Redis.** Considered and rejected:

- *Redis pub/sub* — wrong semantics entirely. Pub/sub is fan-out: every
  subscriber receives every message, so N workers would each deliver every event
  N times. A work queue is required, where each message goes to exactly one
  consumer.
- *Redis Streams + consumer groups* — ~1 Redis op per publish, so more headroom
  at 10k/s, but ack, retry, and dead-lettering must be hand-rolled.
- *NATS JetStream* — best raw throughput, but introduces a broker nobody on the
  project knows for a problem Redis can hold.

BullMQ costs ~4–6 Redis ops per job, so 10k events/s ≈ 40–60k Redis ops/s
against a single instance's ~100k ops/s ceiling. That fits, with less headroom
than is comfortable. If it ever binds, Redis Streams is a swap of the transport
layer rather than a redesign.

### Timing ownership

The scheduler publishes in **real time**: it walks the sorted events and enqueues
each at its scheduled moment. Workers pop and POST immediately, holding no timing
logic. Enqueue is cheap (~1 round trip); the expensive HTTP work is what gets
distributed.

The alternative — pre-loading every job upfront with a per-job BullMQ `delay` —
was rejected because BullMQ's delayed-job promotion becomes the new single
bottleneck and has millisecond granularity regardless.

Keeping timing in one place also means the future bucketing work lands in one
file rather than being smeared across the pool.

### Message contents

Workers receive the **full event payload** in the job, not an event ID. At 100k
events × ~500B that is ~50MB through Redis per run, which is acceptable, and it
means workers need only a `REDIS_URL` — no `SIM_DATA_DIR` volume mount, so the
pool is not tied to one host.

### Run-state aggregation

Workers `INCR` Redis counters per outcome. The scheduler flushes those counters
to the `simulation_runs` row on a ~1s timer and writes the terminal state at the
end, reusing `writeRunState` unchanged. The existing `ProgressSnapshot` shape is
kept, with `inFlight` reinterpreted as queue depth.

Workers deliberately do **not** write SQLite. N processes contending on one
writer would reintroduce `SQLITE_BUSY` at exactly the rate this change exists to
scale. The portal reads the same row it reads today, so **no portal changes are
required**.

### Stop and failure

Stop: the portal SIGTERMs the scheduler pid, unchanged. The scheduler sets the
Redis stop flag and quits publishing; workers check the flag per job and skip
anything already queued for that run; the scheduler drains and writes `stopped`.

If a worker dies mid-job, BullMQ redelivers after the stalled-job interval —
strictly better than today, where a crashed worker loses the whole run.

### Backpressure

If the pool cannot keep up, the queue grows and events are delivered late.
The scheduler must not pause to let workers catch up, because pausing corrupts
the schedule. Instead it surfaces queue depth in the progress snapshot and logs
when depth exceeds a threshold, so lag is visible rather than silent.

### Compose

Add a `redis:7-alpine` service and a `sim-worker` service using the existing
shared `simdpg:latest` image with `SERVICE_DIR: simulation` and
`deploy.replicas: 8`. The portal gains a `REDIS_URL` and a `depends_on` for
Redis. Workers need no volume.

New configuration: `REDIS_URL`, `SIM_WORKER_CONCURRENCY`.

## What changes

Unchanged: event generation, the `events.json` format, every portal API route,
the `simulations` and `simulation_runs` schemas, `writeRunState`, and `deliver()`.

Changed: `runEvents` keeps its schedule loop, but `dispatch()` swaps from
awaiting an HTTP POST to enqueueing a job. The `maxConcurrency` /
`Promise.race` backpressure block is removed — pool concurrency (replicas ×
per-worker concurrency) replaces it.

New: `simulation/src/engine/delivery-worker.ts` (worker entry), a Redis client
module, and counter aggregation in the scheduler.

## Testing

- `deliver()` unit tests carry over unchanged.
- Scheduler publish-loop tests against a fake queue, asserting enqueue timing and
  ordering (mirroring the existing `scheduler.test.ts` fake-clock approach).
- Worker handler tests covering outcome classification and counter increments.
- One integration test against a real Redis via a compose profile, asserting that
  a run's counters aggregate correctly across more than one worker.

## Expected outcome, and the known shortfall

This phase is expected to land at roughly **2–5k deliveries/sec**, not 10k.

The scheduler still enqueues one job per event from a `setTimeout`-driven loop,
so it inherits Node's ~1ms timer floor and caps out near 1–2k enqueues/sec
regardless of how many workers are idle. That is a genuine 2–3× improvement and
it proves the architecture, but it is short of target by design: the queue is the
larger, riskier change and it is a prerequisite for the rest.

## Future work

Two follow-ups close the remaining gap. Both are deferred deliberately; neither
is required for this phase to be useful.

### Time bucketing

At 10k events/s the events are spaced ~100 microseconds apart, but `setTimeout`
has a ~1ms floor in Node. Every per-event `waitMs` is therefore either rounded up
to 1ms — capping the loop near 1,000 events/s — or already negative and skipped,
collapsing the schedule into a hot loop. The microsecond offsets in
`scheduledMicros` are effectively decorative today.

The fix is to stop sleeping per event and instead group events into fixed
wall-clock buckets (~5–10ms). The loop sleeps once per bucket and releases that
bucket's events together. Precision drops to the bucket width, which is well
inside what an HTTP webhook round trip can resolve anyway, and the timer count
falls from ~10,000/s to ~100–200/s. This is what actually unlocks rates above
~1–2k/s.

### addBulk

Once events are grouped into buckets, each bucket becomes a single
`queue.addBulk([...])` call instead of N separate `queue.add()` calls. A 10ms
bucket at 10k/s holds ~100 events, so this cuts Redis round trips by ~100×,
taking BullMQ's per-job overhead from a real constraint (40–60k ops/s) down to
negligible.

The two changes are naturally sequenced: bucketing produces the batches that make
`addBulk` possible, so they land together as one follow-up rather than
separately.
