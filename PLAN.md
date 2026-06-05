# SimDPG — What's Next

## What's Done

- [x] Mono-repo scaffold with npm workspaces
- [x] Identity system (citizens, households, addresses, search)
- [x] Citizens have email and phone_number contact fields for notification delivery
- [x] Civil Registry system (births, deaths, marriages, combined events)
- [x] Health system (patients, encounters, vaccinations, overdue queries)
- [x] Benefits system (programs, eligibility rules, enrollments, payments)
- [x] Notifications system (port 3005) — stores notification records sent to citizens via email/sms
- [x] Typed API clients package (`@simdpg/api-clients`) — includes NotificationsClient
- [x] Gov.uk portal — citizen pages (birth/death/marriage registration, vaccination booking, benefit application, check my record, my notifications)
- [x] Gov.uk portal — staff pages (dashboard, search, citizen timeline)
- [x] Simulation engine — population generator (with email/phone), 6 event scripts, runner with year/scale modes
- [x] End-to-end verified: all systems start, population generates, birth flow works cross-system

## What's Next (in priority order)

### 1. OpenFn Workflows (Part 3 of spec)

This is the core of what we're testing. 10 workflows that wire the systems together:

**Event-driven (triggered by webhooks):**
1. Birth registered → create citizen in identity system
2. Citizen created (newborn) → register as patient, schedule vaccinations
3. Citizen created (newborn) → check child benefit eligibility, enroll if eligible
4. Death registered → close records across identity, health, and benefits
5. Marriage registered → link/merge households, reassess benefits
6. Vaccination administered → update encounter records, push to reporting
7. Enrollment created → schedule payments based on program rules
8. Any system event → look up citizen contact info (email/phone) from identity, send notification via notifications system

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
- [ ] Configure webhook URLs in each system to point to OpenFn endpoints
- [ ] Create each workflow in OpenFn (ideally using AI generation)
- [ ] Document AI generation quality per workflow
- [ ] Test each workflow end-to-end with a single event
- [ ] Run simulation to test at scale

### 2. DCI API Standards & OpenAPI Specs

SimDPG services should be credible stand-ins for real DPGs. Aligning with [DCI (Digital Convergence Initiative)](https://digitalpublicgoods.net/digital-convergence-initiative/) API standards makes the simulated systems behave like the real ones OpenFn will eventually talk to.

**DCI compliance per service:**
- [ ] Adopt standard HTTP status codes and error envelope (`{ "error": { "code", "message", "details" } }`) across all five systems
- [ ] Standardise pagination — all list endpoints return `{ data: [], meta: { page, per_page, total } }`
- [ ] Add `X-Request-ID` header propagation for traceability
- [ ] Use ISO 8601 dates everywhere (audit existing fields — some may be inconsistent)
- [ ] Align webhook event payloads with DCI event schema conventions (type, source, id, time, data)

**OpenAPI specs:**
- [ ] Generate/author `openapi.yaml` for each system (identity, civil-registry, health, benefits, notifications) — colocate at `systems/<name>/openapi.yaml`
- [ ] Validate specs with a linter (e.g. `redocly lint`) as part of CI / `npm run lint`
- [ ] Serve interactive docs from each system at `GET /docs` (e.g. Scalar or Swagger UI middleware)
- [ ] Keep specs in sync with route implementations — add a check task that diffs generated vs committed spec

**Service catalog:**
- [ ] Add a `/catalog` page to the portal listing all five services with: name, description, base URL, status badge, link to its `/docs`, and links to the relevant DCI standard documentation
- [ ] Link each service to the DCI spec section it implements (e.g. Civil Registry → GovStack Civil Registry BB spec, Health → GovStack Health BB spec)
- [ ] Include a "Standards compliance" column showing which DCI/GovStack building-block specs each service targets

### 3. Notification System — Future Enhancements

The notifications system (port 3005) is live and records notification delivery to citizens via email and SMS. OpenFn workflows will wire system events to notification creation. Future work:

- [ ] **Staff notification lookup UI** — portal page at `/staff/notifications` where staff can enter a citizen name or national ID and see all messages delivered to them, with delivery status, timestamps, and channel details
- [ ] **Notification templates** — add a `templates` table so systems can reference named templates (e.g. "birth_confirmation_email", "vaccination_reminder_sms") instead of hardcoding message bodies in workflows
- [ ] **Delivery simulation** — simulate realistic delivery delays, failures, and retries (currently all notifications are marked "sent" immediately)
- [ ] **Notification preferences** — allow citizens to opt in/out of channels (email vs SMS) and notification categories
- [ ] **Batch digest** — aggregate multiple notifications into a single daily/weekly digest email
- [ ] **Audit trail** — track who/what triggered each notification (workflow ID, operator, timestamp)

### 4. Webhook Infrastructure

The systems have webhook emitter stubs but they need to be wired up to actually POST events.

- [ ] Each system's `webhooks.ts` needs a configurable target URL (env var `WEBHOOK_URL`)
- [ ] Add retry logic (exponential backoff) for failed webhook deliveries
- [ ] Add a webhook event log table per system for debugging
- [ ] Test that creating a citizen actually fires `citizen.created` to the configured URL

### 5. Tests

No tests exist yet. Priority areas:

- [ ] System API tests (vitest + supertest) — happy path for each endpoint
- [ ] Cross-system integration tests — birth flow creates citizen, registers patient
- [ ] Simulation smoke test — generate 10 citizens, run one year, verify counts
- [ ] Portal build test — `next build` passes

### 6. Seed Data

Each system has seed scripts but they should be coordinated:

- [ ] Run seed scripts in order: identity → civil-registry → health → benefits
- [ ] Add a root-level `npm run seed` that runs all seed scripts in sequence
- [ ] Ensure seed data is consistent across systems (same citizen IDs referenced)

### 7. Portal Improvements

- [x] Server-side API calls — staff dashboard converted to server component; all other pages proxy through `/api/proxy/[system]/[...path]` route to keep system URLs server-side.
- [ ] Error states — handle systems being down gracefully on all pages
- [ ] Confirmation pages — after form submission, show a gov.uk-style confirmation panel with a reference number
- [ ] Mobile testing — verify responsive layout works
- [ ] **Population management page** (`/staff/population`) — staff-facing control panel for the simulated population:
  - Display current population stats (total citizens, households, births/deaths/marriages to date)
  - **Delete population** — wipe all data across all systems (with a confirmation prompt)
  - **Generate new population** — trigger the simulation's population generator with configurable options
  - **Config options**: population size, age distribution, geographic spread, household size range, language/ethnicity mix, pre-existing conditions rate, benefit eligibility rate
  - **Export config** — download current population config as JSON so it can be reproduced later
  - **Import config** — upload a saved config JSON to re-run with the same parameters
  - Show a log of recent generation runs (timestamp, config summary, outcome)
- [ ] **Simulation controls page** (`/staff/simulation`) — real-time control of the simulation engine's time speed:
  - Speed selector: **Real-time** (1x) | **100×** | **1000×** (custom multiplier input)
  - Current simulation clock display — shows simulated date/time vs. wall clock time
  - Start / pause / reset simulation controls
  - Live event feed — stream recent simulation events (births, deaths, etc.) as they fire
  - Simulation engine exposes a control API (e.g. `POST /simulation/speed`, `GET /simulation/status`) that the portal page calls

### 8. Scale Testing Infrastructure

- [ ] Add `simulation/reports/` directory for markdown reports
- [ ] Capture latency percentiles (p50, p95, p99) per system endpoint
- [ ] Capture OpenFn workflow execution metrics (success/failure/timeout)
- [ ] Run at each scale tier and document findings:
  - Dev: 100 citizens, ~500 events
  - Small: 10,000 citizens, ~50,000 events
  - Medium: 100,000 citizens, ~500,000 events
  - Large: 1,000,000 citizens, ~5,000,000 events

### 9. Deployment

- [ ] Fill in `docker-compose.yml` with system containers
- [ ] Add Dockerfiles per system
- [ ] Configure Nginx reverse proxy
- [ ] Deploy to VPS
- [ ] Set up OpenFn cloud connection
- [ ] Deploy portal to Vercel

### 10. Database Migration to Postgres

For deployed/scale environments:

- [ ] Add Postgres Drizzle configs alongside SQLite
- [ ] Test each system with Postgres
- [ ] Update docker-compose with Postgres containers

## Key Decisions Still Open

1. **OpenFn setup** — Are we using OpenFn cloud or self-hosted Lightning? This determines webhook URL configuration.
2. **Auth** — The spec says auth is out of scope for now. Staff pages currently have no access control. When do we add it?
3. **Real DPG swap** — When real systems (OpenCRVS, DHIS2, etc.) come online, the plan is to swap them in behind the same OpenFn workflows. Do we need to build adapter compatibility tests now?
