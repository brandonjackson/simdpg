# SimDPG — What's Next

## What's Done

- [x] Mono-repo scaffold with npm workspaces
- [x] Identity service (citizens, households, addresses, search)
- [x] Civil Registry service (births, deaths, marriages, combined events)
- [x] Health service (patients, encounters, vaccinations, overdue queries)
- [x] Benefits service (programs, eligibility rules, enrollments, payments)
- [x] Typed API clients package (`@simdpg/api-clients`)
- [x] Gov.uk portal — citizen pages (birth/death/marriage registration, vaccination booking, benefit application, check my record)
- [x] Gov.uk portal — staff pages (dashboard, search, citizen timeline)
- [x] Simulation engine — population generator, 6 event scripts, runner with year/scale modes
- [x] End-to-end verified: all services start, population generates, birth flow works cross-service

## What's Next (in priority order)

### 1. OpenFn Workflows (Part 3 of spec)

This is the core of what we're testing. 10 workflows that wire the services together:

**Event-driven (triggered by webhooks):**
1. Birth registered → create citizen in identity service
2. Citizen created (newborn) → register as patient, schedule vaccinations
3. Citizen created (newborn) → check child benefit eligibility, enroll if eligible
4. Death registered → close records across identity, health, and benefits
5. Marriage registered → link/merge households, reassess benefits
6. Vaccination administered → update encounter records, push to reporting
7. Enrollment created → schedule payments based on program rules

**Scheduled (cron):**
8. Daily: age-based eligibility changes (turning 18 → terminate child benefit, check adult programs)
9. Weekly: missed vaccination follow-up (query overdue, schedule consultations)
10. Duplicate citizen detection (fuzzy match, flag/merge, cascade ID changes)

**What to measure for each workflow:**
- Did OpenFn AI generate a working first draft from the spec description?
- How many manual edits were needed?
- Error rate and retry behavior under load
- Latency per execution

**Action items:**
- [ ] Configure webhook URLs in each service to point to OpenFn endpoints
- [ ] Create each workflow in OpenFn (ideally using AI generation)
- [ ] Document AI generation quality per workflow
- [ ] Test each workflow end-to-end with a single event
- [ ] Run simulation to test at scale

### 2. Webhook Infrastructure

The services have webhook emitter stubs but they need to be wired up to actually POST events.

- [ ] Each service's `webhooks.ts` needs a configurable target URL (env var `WEBHOOK_URL`)
- [ ] Add retry logic (exponential backoff) for failed webhook deliveries
- [ ] Add a webhook event log table per service for debugging
- [ ] Test that creating a citizen actually fires `citizen.created` to the configured URL

### 3. Tests

No tests exist yet. Priority areas:

- [ ] Service API tests (vitest + supertest) — happy path for each endpoint
- [ ] Cross-service integration tests — birth flow creates citizen, registers patient
- [ ] Simulation smoke test — generate 10 citizens, run one year, verify counts
- [ ] Portal build test — `next build` passes

### 4. Seed Data

Each service has seed scripts but they should be coordinated:

- [ ] Run seed scripts in order: identity → civil-registry → health → benefits
- [ ] Add a root-level `npm run seed` that runs all seed scripts in sequence
- [ ] Ensure seed data is consistent across services (same citizen IDs referenced)

### 5. Portal Improvements

- [x] Server-side API calls — staff dashboard converted to server component; all other pages proxy through `/api/proxy/[service]/[...path]` route to keep service URLs server-side.
- [ ] Error states — handle services being down gracefully on all pages
- [ ] Confirmation pages — after form submission, show a gov.uk-style confirmation panel with a reference number
- [ ] Mobile testing — verify responsive layout works

### 6. Scale Testing Infrastructure

- [ ] Add `simulation/reports/` directory for markdown reports
- [ ] Capture latency percentiles (p50, p95, p99) per service endpoint
- [ ] Capture OpenFn workflow execution metrics (success/failure/timeout)
- [ ] Run at each scale tier and document findings:
  - Dev: 100 citizens, ~500 events
  - Small: 10,000 citizens, ~50,000 events
  - Medium: 100,000 citizens, ~500,000 events
  - Large: 1,000,000 citizens, ~5,000,000 events

### 7. Deployment

- [ ] Fill in `docker-compose.yml` with service containers
- [ ] Add Dockerfiles per service
- [ ] Configure Nginx reverse proxy
- [ ] Deploy to VPS
- [ ] Set up OpenFn cloud connection
- [ ] Deploy portal to Vercel

### 8. Database Migration to Postgres

For deployed/scale environments:

- [ ] Add Postgres Drizzle configs alongside SQLite
- [ ] Test each service with Postgres
- [ ] Update docker-compose with Postgres containers

## Key Decisions Still Open

1. **OpenFn setup** — Are we using OpenFn cloud or self-hosted Lightning? This determines webhook URL configuration.
2. **Auth** — The spec says auth is out of scope for now. Staff pages currently have no access control. When do we add it?
3. **Real DPG swap** — When real systems (OpenCRVS, DHIS2, etc.) come online, the plan is to swap them in behind the same OpenFn workflows. Do we need to build adapter compatibility tests now?
