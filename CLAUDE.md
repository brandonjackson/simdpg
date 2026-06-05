# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SimDPG is a simulated city-state's digital public infrastructure for stress-testing OpenFn integration workflows. Four independent government microservices communicate only via HTTP (no shared databases), fronted by a gov.uk-style portal. A simulation engine generates synthetic populations and replays life events through the service APIs.

## Commands

```bash
# Development
npm install                    # Install all workspace dependencies
npm run dev                    # Start all services + portal (ports 3001-3004 + 3000)
npm run dev:services           # Start only the 4 backend services

# Individual service
cd services/identity && npm run dev   # Run one service in isolation

# Data
npm run setup                  # Seed all services with sample data (no services needed)
npm run setup:generate         # Generate 100 synthetic citizens (services must be running)
POPULATION_SIZE=1000 npm run setup:generate  # Custom population size
npm run reset                  # Delete all SQLite databases

# Build & Test
npm run build                  # Build all workspaces (tsc)
npm run test                   # Run vitest across all workspaces
npm run test -w @simdpg/identity       # Test a single service
npx vitest run src/some.test.ts -w @simdpg/identity  # Run a single test file

# Simulation (services must be running)
npm run sim:generate -w @simdpg/simulation  # Generate population
npm run sim:year -w @simdpg/simulation      # Simulate one year of events
YEARS=5 CONCURRENCY=10 npm run sim:scale -w @simdpg/simulation  # Multi-year
```

## Architecture

**Monorepo with npm workspaces.** Workspace packages: `services/*`, `packages/*`, `portal`, `simulation`.

### Services (Express + Drizzle ORM + SQLite)

Each service is fully autonomous: own Express app, own SQLite database (in `services/<name>/data/`), own Drizzle schema. They all follow the same internal structure:

```
services/<name>/src/
  index.ts          # Express app setup, health endpoint, route mounting
  db/
    schema.ts       # Drizzle table definitions
    index.ts        # DB connection + ensureTables() (raw CREATE TABLE IF NOT EXISTS)
    seed.ts         # Sample data seeder
  routes/           # Express routers per resource
  middleware/
    error-handler.ts
  webhooks.ts       # emitWebhook(eventType, payload) — fire-and-forget POST to WEBHOOK_URL
```

**Ports:** Identity=3001, Civil Registry=3002, Health=3003, Benefits=3004.

**Database pattern:** Tables are created by `ensureTables()` in `db/index.ts` using raw SQL (`CREATE TABLE IF NOT EXISTS`), not Drizzle migrations. The Drizzle schema in `schema.ts` mirrors these tables for type-safe queries but doesn't drive table creation.

### Shared API Clients (`packages/api-clients`)

Typed HTTP clients used by the portal and simulation engine. Must be built before other packages can use it (`npm run build -w @simdpg/api-clients`; the `predev` script handles this automatically).

`SERVICE_URLS` in `packages/api-clients/src/index.ts` defines default service URLs, overridable via env vars: `IDENTITY_URL`, `CIVIL_REGISTRY_URL`, `HEALTH_URL`, `BENEFITS_URL`.

### Portal (Next.js 14, App Router)

Runs on port 3000. All service API calls go through a server-side proxy route at `/api/proxy/[service]/[...path]` to avoid CORS issues — the browser never talks directly to services.

### Webhook System

Each service emits webhook events (e.g., `citizen.created`, `birth.registered`) via `emitWebhook()`. Currently fire-and-forget POSTs to `process.env.WEBHOOK_URL`. If `WEBHOOK_URL` is unset, webhooks are silently disabled. These are intended as OpenFn trigger endpoints.

## Key Conventions

- All services use `type: "module"` (ESM). Imports must include `.js` extensions.
- IDs are UUIDs (via the `uuid` package). National IDs follow the format `SIM-XXXXXX`.
- Validation uses Zod schemas in route handlers.
- All date/time values stored as ISO 8601 strings (TEXT columns in SQLite).
- TypeScript strict mode enabled via shared root `tsconfig.json`.

## Environment Variables

| Variable | Used By | Default | Purpose |
|---|---|---|---|
| `WEBHOOK_URL` | All services | (unset) | Target URL for webhook event POSTs |
| `IDENTITY_URL` | api-clients | `http://localhost:3001` | Identity service URL |
| `CIVIL_REGISTRY_URL` | api-clients | `http://localhost:3002` | Civil Registry service URL |
| `HEALTH_URL` | api-clients | `http://localhost:3003` | Health service URL |
| `BENEFITS_URL` | api-clients | `http://localhost:3004` | Benefits service URL |
| `PORT` | Each service | Service-specific | Override service port |
| `POPULATION_SIZE` | simulation | `100` | Number of citizens to generate |
