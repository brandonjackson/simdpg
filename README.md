# SimDPG

A simulated city-state's digital public infrastructure. Five government systems (identity, civil registry, health, benefits, notifications), a gov.uk-style portal, and a population simulation engine — all wired together to stress-test [OpenFn](https://openfn.org) integration workflows before a national platform launch.

## Architecture

```
Portal (Next.js :3000)
  └── calls system APIs

Systems
  ├── Identity        :3001  (citizens, households, addresses)
  ├── Civil Registry  :3002  (births, deaths, marriages)
  ├── Health          :3003  (patients, encounters, vaccinations)
  ├── Benefits        :3004  (programs, eligibility, enrollments, payments)
  └── Notifications   :3005  (email/sms messages to citizens)

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
│   └── benefits/          # Social protection (port 3004)
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

All systems emit webhook events (`citizen.created`, `birth.registered`, etc.) to a configurable URL for OpenFn integration.

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
| `npm run test` | Run tests across all workspaces |

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Systems:** Express, Drizzle ORM, better-sqlite3
- **Portal:** Next.js 14, React 18
- **Validation:** Zod
- **Workspaces:** npm workspaces
- **Dev tooling:** tsx (watch mode), vitest, concurrently
