# SimDPG

A simulated city-state's digital public infrastructure. Four government services (identity, civil registry, health, benefits), a gov.uk-style portal, and a population simulation engine — all wired together to stress-test [OpenFn](https://openfn.org) integration workflows before a national platform launch.

## Architecture

```
Portal (Next.js :3000)
  └── calls service APIs

Services
  ├── Identity       :3001  (citizens, households, addresses)
  ├── Civil Registry  :3002  (births, deaths, marriages)
  ├── Health          :3003  (patients, encounters, vaccinations)
  └── Benefits        :3004  (programs, eligibility, enrollments, payments)

Each service: Express + Drizzle ORM + SQLite
Services communicate only via HTTP — no shared databases.

Simulation Engine
  └── Generates synthetic population, replays life events through service APIs
```

## Quick Start

```bash
git clone https://github.com/brandonjackson/simdpg.git
cd simdpg
npm install
npm run dev
```

This starts all four services and the portal. Open [http://localhost:3000](http://localhost:3000).

### Populate with data

Seed each service with sample records (works without services running):

```bash
npm run setup
```

Or generate a larger synthetic population (requires services to be running):

```bash
npm run dev:services   # in one terminal
npm run setup:generate # in another — generates 100 citizens by default
```

Use `POPULATION_SIZE=1000 npm run setup:generate` for a custom size.

### Reset everything

```bash
npm run reset
```

Deletes all SQLite databases. Restart services after if they're running.

## Project Structure

```
simdpg/
├── services/
│   ├── identity/          # Citizen identity (port 3001)
│   ├── civil-registry/    # Vital events (port 3002)
│   ├── health/            # Patient records (port 3003)
│   └── benefits/          # Social protection (port 3004)
├── portal/                # Next.js gov.uk-style frontend (port 3000)
├── simulation/            # Population generator + event scripts
├── packages/
│   └── api-clients/       # Typed HTTP clients for each service
├── package.json           # Root workspace config
└── tsconfig.json          # Shared TypeScript config
```

## Services

Each service is a standalone Express app with its own SQLite database, schema, seed data, and port. Any single service can be run in isolation:

```bash
cd services/identity
npm run dev
```

### Identity Service (:3001)

The canonical citizen record. Every other service references citizens by the UUID issued here.

| Endpoint | Description |
|---|---|
| `POST /citizens` | Create citizen, returns assigned national_id (SIM-XXXXXX) |
| `GET /citizens/:id` | Get citizen by UUID |
| `GET /citizens?national_id=X` | Lookup by national ID |
| `GET /citizens/search?name=X&dob=Y` | Fuzzy search |
| `PATCH /citizens/:id` | Update fields (including marking deceased) |
| `POST /households` | Create household with members |
| `GET /citizens/:id/household` | Get household members |

### Civil Registry Service (:3002)

Official record of vital events. References identity service for citizen data.

| Endpoint | Description |
|---|---|
| `POST /births` | Register a birth |
| `POST /deaths` | Register a death |
| `POST /marriages` | Register a marriage |
| `GET /events?citizen_id=X` | All vital events for a citizen |

### Health Service (:3003)

Patient records, encounters, and vaccination tracking.

| Endpoint | Description |
|---|---|
| `POST /patients` | Register a patient (takes citizen_id) |
| `GET /patients?citizen_id=X` | Lookup by citizen ID |
| `POST /encounters` | Record an encounter |
| `POST /vaccinations` | Record a vaccination |
| `GET /vaccinations/overdue?as_of=DATE` | Patients with overdue vaccinations |

### Benefits Service (:3004)

Social protection programs, eligibility, enrollment, and payments.

| Endpoint | Description |
|---|---|
| `GET /programs` | List all programs |
| `POST /eligibility/check` | Check citizen eligibility for a program |
| `POST /enrollments` | Enroll a citizen |
| `PATCH /enrollments/:id` | Update status (suspend, terminate) |
| `POST /payments/schedule` | Schedule payments for an enrollment |

All services emit webhook events (`citizen.created`, `birth.registered`, etc.) to a configurable URL for OpenFn integration.

## Portal

A Next.js app with gov.uk-inspired design (green header, breadcrumbs, one-question-per-page forms).

**Citizen-facing pages:**
- Register a birth, death, or marriage
- Book a vaccination
- Apply for a benefit
- Check my record (cross-service summary by national ID)

**Staff-facing pages:**
- Dashboard with service stats
- Citizen search by name/DOB
- Citizen timeline (events from all services in chronological order)

## Simulation Engine

Generates a synthetic population and replays realistic life events through the service APIs. Requires services to be running.

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
| `npm run dev` | Start all services + portal |
| `npm run dev:services` | Start services only (no portal) |
| `npm run setup` | Seed all services with sample data |
| `npm run setup:generate` | Generate synthetic population (services must be running) |
| `npm run reset` | Delete all databases (clean slate) |
| `npm run build` | Build all workspaces |
| `npm run test` | Run tests across all workspaces |

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Services:** Express, Drizzle ORM, better-sqlite3
- **Portal:** Next.js 14, React 18
- **Validation:** Zod
- **Workspaces:** npm workspaces
- **Dev tooling:** tsx (watch mode), vitest, concurrently
