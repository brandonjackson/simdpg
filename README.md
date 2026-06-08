# SimDPG

A simulated city-state's digital public infrastructure. Six government systems (identity, civil registry, health, benefits, notifications, social registry), a gov.uk-style portal, and a population simulation engine — all wired together to stress-test [OpenFn](https://openfn.org) integration workflows before a national platform launch.

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

This starts all five systems and the portal. Open [http://localhost:3000](http://localhost:3000).

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

## Project Structure

```
simdpg/
├── systems/
│   ├── identity/          # Citizen identity (port 3001)
│   ├── civil-registry/    # Vital events (port 3002)
│   ├── health/            # Patient records (port 3003)
│   ├── benefits/          # Social protection (port 3004)
│   ├── notifications/     # Email/SMS messaging (port 3005)
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
- **DCI / CloudEvents-style webhooks** — events are emitted as `{ id, type, source, time, data }` to a configurable `WEBHOOK_URL` for OpenFn integration (`citizen.created`, `birth.registered`, etc.), and recorded in a per-system `webhook_events` log.
- **OpenAPI** — each system ships an `openapi.yaml`, serves the raw spec at `GET /openapi.yaml`, and renders interactive docs at `GET /docs`.

Each system also exposes `GET /admin/webhooks` — a paginated log of every event it has emitted, with delivery status — useful for debugging OpenFn integrations.

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
