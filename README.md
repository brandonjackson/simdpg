# SimDPG

A simulated city-state's digital public infrastructure. Seven government systems (identity, civil registry, health, benefits, notifications, payments, social registry), a gov.uk-style portal, and a population simulation engine — all wired together to stress-test [OpenFn](https://openfn.org) integration workflows before a national platform launch.

## Architecture

```
Portal (Next.js :3000)
  └── calls system APIs

Systems
  ├── Identity        :3001  (citizens, households, addresses)
  ├── Civil Registry  :3002  (births, deaths, marriages)
  ├── Health          :3003  (patients, encounters, vaccinations)
  ├── Benefits        :3004  (programs, eligibility, enrollments, payments)
  ├── Notifications   :3005  (email/sms messages to citizens)
  ├── Payments        :3006  (treasury/citizen accounts, ledger, disbursements)
  └── Social Registry :3007  (needs assessments, targeting profiles)

Each system: Express + Drizzle ORM + SQLite
Systems communicate only via HTTP — no shared databases.

Simulation Engine
  └── Generates synthetic population, replays life events through system APIs
```

## Quick Start

```bash
git clone https://github.com/brandonjackson/simdpg.git
cd simdpg
npm install
npm run dev
```

This starts all seven systems and the portal. Open [http://localhost:3000](http://localhost:3000).

### Populate with data

Seed each system with sample records (works without systems running):

```bash
npm run setup
```

Or generate a larger synthetic population (requires systems to be running):

```bash
npm run dev:systems    # in one terminal
npm run setup:generate # in another — generates 100 citizens by default
```

Use `POPULATION_SIZE=1000 npm run setup:generate` for a custom size.

### Reset everything

```bash
npm run reset
```

Deletes all SQLite databases. Restart systems after if they're running.

## Deployment

The whole stack ships as a single Docker image. Run it locally with:

```bash
docker build -t simdpg:latest .   # build the shared image once
docker compose up                 # start every system + the portal
```

This seeds each database on first run.
For Railway (or any container host) and the full configuration reference, see
[DEPLOY.md](DEPLOY.md).

## Project Structure

```
simdpg/
├── systems/
│   ├── identity/          # Citizen identity (port 3001)
│   ├── civil-registry/    # Vital events (port 3002)
│   ├── health/            # Patient records (port 3003)
│   ├── benefits/          # Social protection (port 3004)
│   ├── notifications/     # Email/SMS messaging (port 3005)
│   ├── payments/          # Mock disbursement ledger (port 3006)
│   └── social-registry/   # Needs-based targeting (port 3007)
├── portal/                # Next.js gov.uk-style frontend (port 3000)
├── simulation/            # Population generator + event scripts
├── packages/
│   └── api-clients/       # Typed HTTP clients for each system
├── package.json           # Root workspace config
└── tsconfig.json          # Shared TypeScript config
```

## Systems

Each system is a standalone Express app with its own SQLite database, schema, seed data, and port. Any single system can be run in isolation:

```bash
cd systems/identity
npm run dev
```

### Identity System (:3001)

The canonical citizen record. Every other system references citizens by the UUID issued here.

| Endpoint | Description |
|---|---|
| `POST /citizens` | Create citizen, returns assigned national_id (SIM-XXXXXX) |
| `GET /citizens/:id` | Get citizen by UUID |
| `GET /citizens?national_id=X` | Lookup by national ID |
| `GET /citizens/search?name=X&dob=Y` | Fuzzy search |
| `PATCH /citizens/:id` | Update fields (including marking deceased) |
| `POST /households` | Create household with members |
| `GET /citizens/:id/household` | Get household members |

### Civil Registry System (:3002)

Official record of vital events. References identity system for citizen data.

| Endpoint | Description |
|---|---|
| `POST /births` | Register a birth |
| `POST /deaths` | Register a death |
| `POST /marriages` | Register a marriage |
| `GET /events?citizen_id=X` | All vital events for a citizen |

### Health System (:3003)

Patient records, encounters, and vaccination tracking.

| Endpoint | Description |
|---|---|
| `POST /patients` | Register a patient (takes citizen_id) |
| `GET /patients?citizen_id=X` | Lookup by citizen ID |
| `POST /encounters` | Record an encounter |
| `POST /vaccinations` | Record a vaccination |
| `GET /vaccinations/overdue?as_of=DATE` | Patients with overdue vaccinations |

### Benefits System (:3004)

Social protection programs, eligibility, enrollment, and payments.

| Endpoint | Description |
|---|---|
| `GET /programs` | List all programs |
| `POST /eligibility/check` | Check citizen eligibility for a program |
| `POST /enrollments` | Enroll a citizen |
| `PATCH /enrollments/:id` | Update status (suspend, terminate) |
| `POST /payments/schedule` | Schedule payments for an enrollment |

### Payments System (:3006)

The disbursing layer that Benefits lacks on its own: Benefits *schedules*
payments, but Payments actually *pays them out*. It keeps a double-entry ledger
with one account for the government (the disbursing treasury) and one account
per citizen. A disbursement is **mocked** — no real money moves; a completed
payment only ever appears as paired ledger entries (debit treasury, credit
citizen).

Crucially, the disbursement API **fails at random** to behave like a real
government payment gateway. Failure modes and their rates live in
`systems/payments/src/payments.config.ts`; each disbursement may return one of
five gateway-style errors instead of completing: `INSUFFICIENT_FUNDS`,
`ACCOUNT_NOT_FOUND`, `GATEWAY_TIMEOUT`, `DUPLICATE_TRANSACTION`, or
`SERVICE_UNAVAILABLE`. Set `PAYMENTS_DISABLE_FAILURES=1` to turn the random
failures off (the genuine balance and account checks still apply). This lets
OpenFn workflows exercise retries, idempotency, and failure notifications
exactly as they would against a live banking partner.

| Endpoint | Description |
|---|---|
| `POST /accounts` | Open an account (treasury or citizen); idempotent per owner |
| `GET /accounts?owner_type=&owner_id=` | List accounts |
| `GET /accounts/:id` | Get an account with its current balance |
| `GET /accounts/:id/ledger` | List ledger entries for an account |
| `POST /payments` | Request a disbursement (requires an idempotency key); may fail at random |
| `GET /payments?account_id=&enrollment_id=&status=` | List payments |
| `GET /payments/:id` | Get a payment with its ledger entries |

### Social Registry System (:3007)

Needs-based targeting registry. Records welfare assessments per household and
exposes a targeting profile that Benefits consults during eligibility checks,
so targeting is driven by assessed need rather than programme rules alone.

| Endpoint | Description |
|---|---|
| `POST /assessments` | Record a needs assessment (PMT score + vulnerability indicators) for a household |
| `GET /assessments?household_id=X` | List assessments, filter by household, citizen, or status |
| `GET /assessments/:id` | Get a single assessment with its vulnerability indicators |
| `GET /households/:id/targeting-profile` | Targeting profile (PMT score, income band, vulnerability flags, targeting band) used by Benefits |
| `GET /registry?income_band=&vulnerability=&targeted=` | Query assessed households by targeting criteria |
| `POST /recertify` | Re-run targeting for a household (issues a new assessment, supersedes the old) |

A household is assigned a **targeting band** — `priority`, `eligible`, or
`not_targeted` — from its proxy-means-test (PMT) score (0–100, lower = poorer)
and the weighted sum of its vulnerability indicators (disability, elderly,
single-parent, chronic illness, unemployed, dependents). Assessments carry a
12-month validity window; an expired assessment is reported but never targets.

### Shared API conventions (DCI)

Every system follows a common set of [Digital Convergence Initiative](https://docs.dci.global/)-aligned conventions, provided by the shared `@simdpg/system-kit` package:

- **Error envelope** — errors return `{ "error": { "code", "message", "details" } }` with a standard HTTP status.
- **Pagination** — list endpoints accept `?page=&per_page=` and return `{ "data": [...], "meta": { "page", "per_page", "total" } }`.
- **Traceability** — an `X-Request-ID` header is honoured if supplied (otherwise minted) and echoed on every response.
- **ISO 8601 dates** throughout.
- **DCI / CloudEvents-style webhooks** — events are emitted as `{ id, type, source, time, data }` for OpenFn integration (`citizen.created`, `birth.registered`, etc.) and recorded in a per-system `webhook_events` log. Each event is delivered to every URL registered for its event type (see below); a legacy `WEBHOOK_URL` env var, if set, is treated as an additional catch-all target.
- **OpenAPI** — each system ships an `openapi.yaml`, serves the raw spec at `GET /openapi.yaml`, and renders interactive docs at `GET /docs`.

Each system also exposes `GET /admin/webhooks` — a paginated log of every event it has emitted, with delivery status — useful for debugging OpenFn integrations.

**Per-event webhook subscriptions.** Rather than one URL per system, each system
keeps a registry of delivery targets keyed by event type (`GET`/`POST`/`DELETE
/admin/webhook-subscriptions`), so an event can fan out to several workflows.
Manage these from the portal staff area under **Webhook registration**
(`/staff/webhooks`), which lists every event grouped by system and lets you add
or remove target URLs.

**Form-submission webhooks.** Portal service forms don't call OpenFn directly:
each submits to a central point in the portal (`/api/forms/<form-key>`), which
forwards the payload to the webhook URL registered for that form. The same
**Webhook registration** page has a **Form submissions** section for pointing a
form at a workflow without redeploying. Forms still fall back to their legacy
`OPENFN_*` env var until a URL is registered, which then takes precedence.

### Projects

Registrations are grouped into **projects** — one project per set of webhook
URLs, normally one OpenFn project. Clone an OpenFn project five times and every
workflow in each clone gets its own Webhook trigger URL; register five projects
in the staff area (`/staff/projects`) and each holds its own complete set of
URLs. You can add a project, duplicate one (copying its form-submission URLs, so
a clone starts from the original and you only edit what changed), rename it, and
delete it along with its registrations.

- **Form submissions and simulations are project-scoped.** A simulation names the
  project it runs against when it's created (`/staff/simulations`), and every
  event it generates is delivered to that project's URLs — so five simulations
  can send their results to five different OpenFn projects. The URLs are resolved
  once at generation time, so changing a registration doesn't rewrite an
  already-generated run.
- **One project is the default.** Live citizen-facing form submissions go to it,
  because a citizen filling in a form has no project to choose. The default is
  also the only project that falls back to the legacy `OPENFN_*` env vars.
- **System events are not confined to a project.** A registration records which
  project it belongs to (so it can be listed and removed per project), but a
  system emits an event when its own records change and can't tell which
  project's workflow caused the change — so every URL registered for that event
  type is called, across all projects.

### Stochastic behaviour (latency, failures, rate limiting)

Every system can be made to behave like a real one having a bad day — slow,
intermittently failing, or throttling — so workflows get their retry, backoff and
429 handling exercised before they meet a real registry. The config uses the same
keys as [openfn-mocker](https://github.com/brandonjackson/openfn-mocker#simulating-stochastic-behavior):

```jsonc
{
  "latency": {
    "mean_ms": 200,     // average delay added before the request is handled
    "stddev_ms": 60,    // spread; 0 makes every response take exactly mean_ms
    "min_ms": 20,       // lower clamp
    "max_ms": 1500      // upper clamp; null (the default) means no cap
  },
  "error_rate": 0.02,   // share of requests answered with a synthetic failure
  "error_status": 503,
  "rate_limit": { "max": 20, "window_ms": 1000, "status": 429 }  // max 0 = off
}
```

Each request sleeps for a delay drawn from N(`mean_ms`, `stddev_ms`) clamped to
[`min_ms`, `max_ms`]; then, with probability `error_rate`, it is answered with
`error_status` instead of reaching the handler. Separately, up to `rate_limit.max`
requests per `window_ms` are served and the rest get `rate_limit.status` with a
`Retry-After`. Injected responses use the normal error envelope, marked with
`details.injected: true` and an `X-Simdpg-Injected` header; delayed ones carry
`X-Simdpg-Behavior-Delay-Ms`.

**This is off by default**, and `/health`, `/docs` and `/admin` are never
affected — so health checks keep working and a 100%-failure config can always be
switched off again.

Read, set, and clear it per system:

```bash
curl localhost:3001/admin/behavior                      # what is it doing now?
curl -X PUT localhost:3001/admin/behavior \
  -H 'content-type: application/json' \
  -d '{"preset":"flaky"}'                               # or a full config
curl -X DELETE localhost:3001/admin/behavior            # back to default
```

`PUT` accepts a named preset (`realistic`, `slow`, `flaky`, `rate-limited`,
`overloaded`), any subset of the fields above, an optional `source` note, and an
`expires_at` timestamp after which the system clears the config itself. A system
that restarts comes back with behaviour off.

Normally you don't call these by hand: **a simulation defines one behaviour for
the whole run and it is applied to all seven systems** (see
[Simulation Engine](#simulation-engine)). To degrade a deployed system
independently of any run, start it with `SIMDPG_BEHAVIOR_PRESET=flaky` or
`SIMDPG_BEHAVIOR='{"error_rate":0.1}'`.

Validate all specs with `npm run lint` (runs `redocly lint`). Confirm the specs
still match the code with `npm run check:routes`, which boots each app and
diffs its registered routes against the documented paths.

## Portal

A Next.js app with gov.uk-inspired design (green header, breadcrumbs, one-question-per-page forms).

**Citizen-facing pages:**
- Register a birth, death, or marriage
- Book a vaccination
- Apply for a benefit
- Check my record (cross-system summary by national ID)

**Staff-facing pages:**
- Dashboard with system stats
- Citizen search by name/DOB
- Citizen timeline (events from all systems in chronological order)
- Population management (`/staff/population`) — view live stats across all
  systems, generate a configurable synthetic population (size, age
  distribution, geographic spread, household size, ethnicity mix, pre-existing
  conditions rate, benefit eligibility rate), export/import that config as
  JSON, wipe all data, and review a log of recent runs
- Projects (`/staff/projects`) — add, duplicate, rename and delete the projects
  that webhook registrations belong to, and choose which one live portal form
  submissions use (see [Projects](#projects))

- Simulations (`/staff/simulations`) — create a run against the current
  population, choosing its clock speed, duration, target project, per-event
  chances, and how the systems themselves behave while it runs (see
  [system behaviour](#simulating-degraded-systems) below), and copy or re-run an
  existing one (see [Copying and re-running a run](#copying-and-re-running-a-run))

Each system also exposes admin endpoints used by the population page:
`GET /admin/stats` (record counts) and `POST /admin/reset` (wipe that
system's data — the Benefits system preserves its reference programmes).

## Simulation Engine

Generates a synthetic population and replays realistic life events through the system APIs. Requires systems to be running.

```bash
npm run setup:generate                              # Generate 100 citizens
POPULATION_SIZE=10000 npm run setup:generate         # Custom size

npm run sim:year -w @simdpg/simulation               # Simulate one year of life events
YEARS=5 CONCURRENCY=10 npm run sim:scale -w @simdpg/simulation  # Multi-year at scale
```

Event types: births, deaths, marriages, clinic visits, vaccinations, benefit claims — each at demographically realistic rates.

### Copying and re-running a run

Filling in the wizard again to repeat a run is the slow way round. Every
simulation in `/staff/simulations`, and its own detail page, offers one button for
this — the label depends on whether the run has had its turn:

| Source | Button | What happens |
|---|---|---|
| Created, generated, or still running | **Copy** | A new simulation with the same settings, sitting at `created`. Generate and start it when you're ready. A run in progress carries on untouched, and the copy isn't started, so the two never compete for the systems. |
| Stopped, completed, or failed | **Re-run** | The same copy, then generated and started in one go. |

Either way it's the *configuration* that carries over — clock speed, duration,
target project, per-event chances, system behaviour — and never the result. The
copy is a fresh record with its own timeline and no stats, and the run it came
from is left exactly as it was; its detail page names its source under **Copied
from**.

The copy's events are generated fresh, so a re-run repeats the settings rather
than replaying the original's event script: it draws on the population alive
*now* and resolves the webhook URLs registered *now*. Expect a different number
of events each time — the generators are random, and a finished run's script is a
record of what that run did, not a template.

The copy targets the same project as its source. If that project has since been
deleted there's nowhere to send the events, so the copy is refused rather than
quietly redirected at another project — start a new simulation and choose one.
Both actions are `POST /api/simulations/:id/copy`, which takes `{ start: true }`
to generate and start the copy, and an optional `projectId` to point it somewhere
else.

### Simulating degraded systems

A simulation also decides how the systems behave while it runs. Pick one profile
on the **Start new simulation** screen and it applies to all seven systems for the
length of the run:

| Preset | What it rehearses |
|---|---|
| **Off** (default) | Systems respond normally — a run changes nothing about them. |
| **Realistic** | 200 ms ± 60 ms latency, 0.5% 503s — healthy production on a good day. |
| **Slow** | 1200 ms ± 400 ms, 1% 503s — congested or legacy systems. |
| **Flaky** | 400 ms ± 250 ms, 10% 503s — retry and error-handling paths. |
| **Rate limited** | 150 ms ± 50 ms, 20 requests/second then 429s. Deterministic, so this is the one to use for load tests. |
| **Overloaded** | 2000 ms ± 800 ms, 5% 503s, 10 requests/second then 429s. |
| **Custom** | Every field from [stochastic behaviour](#stochastic-behaviour-latency-failures-rate-limiting), starting from whichever preset was selected. |

The worker applies the config just before the first event is delivered and clears
it when the run ends — completed, stopped, or crashed. Three things guarantee the
systems come back:

1. the worker clears them as it shuts down;
2. stopping a run from the portal clears them too, in case the worker is gone;
3. each system expires the config on its own five minutes past the run's
   scheduled end, so even `kill -9` can't leave a system degraded.

While a run is in progress its detail page shows what each system is doing and how
many requests were delayed, failed, or throttled, with a **Reset all systems to
default** button for the rare case where a run ended without clearing up.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start all systems + portal |
| `npm run dev:systems` | Start systems only (no portal) |
| `npm run setup` | Seed all systems with sample data |
| `npm run setup:generate` | Generate synthetic population (systems must be running) |
| `npm run reset` | Delete all databases (clean slate) |
| `npm run build` | Build all workspaces |
| `npm run lint` | Validate all systems' OpenAPI specs (`redocly lint`) |
| `npm run check:routes` | Verify each app's routes match its OpenAPI spec |
| `npm run test` | Run tests across all workspaces |

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Systems:** Express, Drizzle ORM, better-sqlite3
- **Portal:** Next.js 14, React 18
- **Validation:** Zod
- **Workspaces:** npm workspaces
- **Dev tooling:** tsx (watch mode), vitest, concurrently
