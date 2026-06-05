# SimDPG — Roadmap

A simulated city-state's digital public infrastructure, built to stress-test
[OpenFn](https://openfn.org) integration workflows. This plan is organised into
six milestones. Work that doesn't yet fit a milestone is collected under
[Later / Backlog](#later--backlog).

Two distinct catalogs live in the staff area and are referenced throughout:

- **Systems catalog** (`portal/src/app/staff/systems-catalog/page.tsx`,
  `/staff/systems-catalog`) — documents the *systems of record* (the DPI
  building blocks): how each works, its full API, and its core data structures.
  Built, and already documents the five live systems with data model, endpoints,
  webhooks, and cross-system relationships. Extended with stubs in Milestone 1
  and kept in sync as APIs deepen in Milestone 3.
- **Service catalog** (`portal/src/app/staff/service-catalog/page.tsx`) —
  documents the *citizen-facing services*: overview, customer journey, relevant
  systems, and the OpenFn business-logic prompt. Built; extended in Milestone 2.

---

## What's Done

- [x] Mono-repo scaffold with npm workspaces
- [x] Identity system (citizens, households, addresses, search; email + phone contact fields)
- [x] Civil Registry system (births, deaths, marriages, combined events)
- [x] Health system (patients, encounters, vaccinations, overdue queries)
- [x] Benefits system (programs, eligibility rules, enrollments, payments)
- [x] Notifications system (port 3005) — records email/sms notifications to citizens
- [x] Typed API clients package (`@simdpg/api-clients`)
- [x] Gov.uk portal — citizen pages (birth/death/marriage, vaccination booking, benefit application, check my record, my notifications)
- [x] Gov.uk portal — staff pages (dashboard, search, citizen timeline, service catalog, systems catalog)
- [x] Simulation engine — population generator, 6 event scripts, runner with year/scale modes
- [x] End-to-end verified: all systems start, population generates, birth flow works cross-system

---

## Milestone 1 — Identify critical systems

Take stock of which DPI building blocks a credible city-state needs, confirm
each has at least a presence in the repo, and stub the rest in the **systems
catalog** so the full landscape is visible before we deepen anything.

- [ ] **Add status badges to the systems catalog.** The catalog already lists
      the five live systems; mark each entry built / stub / planned so the
      not-yet-built components (added below) are clearly distinguished.
- [ ] **Inventory critical DPI components** against common reference taxonomies
      (GovStack building blocks, DCI). Confirmed present: Identity, Civil
      Registry, Health, Benefits, Notifications. The information-mediator /
      exchange layer is played by OpenFn.
- [ ] **Stub the two components we're adding.** For each, add a systems-catalog
      entry sketching what it will do, even though no code exists:
  - [ ] **Payments** — Benefits *schedules* payments but nothing disburses them. The Payments system keeps a ledger with an account for the government (the disbursing treasury) and an account for every citizen. A payment is **mocked** — no real money moves; it only ever shows up as paired ledger entries (debit treasury, credit citizen). Crucially, the API **fails at random**, with failure modes and their rates set in a config file, using the most common error messages a real government payment gateway hits. The five simulated failures:
    1. `INSUFFICIENT_FUNDS` — disbursing/treasury account lacks the balance for the transfer
    2. `ACCOUNT_NOT_FOUND` — beneficiary account or bank details invalid or unknown
    3. `GATEWAY_TIMEOUT` — upstream banking partner did not respond in time
    4. `DUPLICATE_TRANSACTION` — a payment with this idempotency key was already processed
    5. `SERVICE_UNAVAILABLE` — gateway temporarily unavailable / rate limited, retry later
  - [ ] **Social registry** — needs-based targeting registry that feeds Benefits eligibility.
- [ ] Each stub clearly marked as a sketch so it isn't mistaken for a working system.

---

## Milestone 2 — Service stubs complete

Make the portal show the *full* menu of services a citizen of the city-state
would need, navigable to gov.uk standards, with every service backed by a stub
page and a service-catalog entry — including the OpenFn business-logic prompt.

- [ ] **Full service list on the portal.** Represent every service from
      <https://brandonjackson.org/uds-tracker>, but include *only* the ones
      buildable with systems present in the systems catalog (Milestone 1).
- [ ] **Align with the Digital Convergence Initiative.** Where a DCI standard
      service option exists, model our service on it (naming, scope, flow).
- [ ] **Gov.uk navigation.** Organise services into clear categories, easy to
      browse, following gov.uk best practice (task-based grouping, plain
      language, clear hierarchy).
- [ ] **Under-construction stub page per service.** Clicking a service shows a
      checklist of its build state:
  1. Spec written ✅ — links to the service's entry in the staff service catalog
  2. Build the user form on the portal to initiate the service
  3. Connect the form to the systems using an OpenFn workflow
- [ ] **Service-catalog entry per service** (extends the existing page). Each
      entry contains:
  - Overview of how the service works
  - The customer journey
  - The relevant systems
  - A **text input pre-filled with an OpenFn prompt** describing the underlying
    business logic, ready to paste into OpenFn AI generation

> The existing service catalog already carries overview, customer journey,
> systems, and OpenFn workflow descriptions — the new work is the OpenFn
> *prompt* input, the uds-tracker-aligned service list, the gov.uk navigation,
> and the under-construction stub pages.

---

## Milestone 3 — Systems are feature complete

Turn the systems of record from minimal stubs into credible stand-ins for real
DPGs: full read/write APIs, DCI-aligned data models, OpenAPI specs, and complete
system-catalog documentation.

- [ ] **Core read + write APIs** for each system of record, mirroring the public
      API functions of the equivalent real DPG (e.g. OpenCRVS for civil
      registry, DHIS2 for health).
- [ ] **DCI-aligned data model and naming.** Structure data models and function
      names per Digital Convergence Initiative specs where relevant.
- [ ] **DCI API conventions across all systems:**
  - [ ] Standard HTTP status codes and error envelope `{ "error": { "code", "message", "details" } }`
  - [ ] Standard pagination — list endpoints return `{ data: [], meta: { page, per_page, total } }`
  - [ ] `X-Request-ID` header propagation for traceability
  - [ ] ISO 8601 dates everywhere (audit existing fields for inconsistencies)
  - [ ] Webhook payloads aligned to a DCI-style event schema (type, source, id, time, data)
- [ ] **OpenAPI specs:**
  - [ ] Author `openapi.yaml` per system, colocated at `systems/<name>/openapi.yaml`
  - [ ] Validate specs in CI / `npm run lint` (e.g. `redocly lint`)
  - [ ] Serve interactive docs at `GET /docs` per system (Scalar or Swagger UI)
  - [ ] Keep specs in sync with routes (diff generated vs committed spec)
- [ ] **Systems-catalog entries kept in sync.** The catalog already documents
      how each built system works, its full API, and its core data structures —
      keep these current as the APIs deepen, promote the Milestone 1 stubs as
      they get built, and link each system to the DCI / GovStack building-block
      spec it targets.
- [ ] **Webhook emission wired up** — each system's `webhooks.ts` POSTs real
      events to a configurable target (`WEBHOOK_URL`) so OpenFn can consume them.
- [ ] **Per-system webhook event log table for debugging.**

---

## Milestone 4 — Population system improvements

Give staff real control over how the simulated population is constructed.

- [ ] **Population management page** (`/staff/population`):
  - Current population stats (citizens, households, births/deaths/marriages to date)
  - **Generate new population** — trigger the generator with configurable options
  - **Config options:** size, age distribution, geographic spread, household size range, language/ethnicity mix, pre-existing conditions rate, benefit eligibility rate
  - **Delete population** — wipe all data across all systems (with confirmation)
  - **Export / import config** — download config as JSON and re-run with the same parameters
  - Log of recent generation runs (timestamp, config summary, outcome)

---

## Milestone 5 — Simulation system

Build the engine that *runs the city-state* — firing events automatically,
around the clock, even when nobody is watching. This is the load generator; the
OpenFn workflows it exercises are built in Milestone 6.

- [ ] **Simulation control API** on the engine (e.g. `POST /simulation/speed`,
      `GET /simulation/status`, start / pause / reset).
- [ ] **Simulation controls page** (`/staff/simulation`) in the portal:
  - Speed selector: **Real-time (1×)** | **100×** | **1000×** (custom multiplier)
  - Simulation clock display — simulated date/time vs. wall-clock time
  - Start / pause / reset controls
  - Live event feed — stream recent events (births, deaths, etc.) as they fire
- [ ] **24/7 autonomous run** — leave the simulation running so events fire
      continuously against the systems (and, once Milestone 6 lands, the OpenFn
      workflows). _Technical approach TBD_ (long-running scheduler/worker,
      durable clock, resumable state).
- [ ] **Capture system-side performance** as the load runs:
  - Latency percentiles (p50/p95/p99) per system endpoint
  - Run at scale tiers and write up findings in `simulation/reports/`:
    - Dev: 100 citizens, ~500 events
    - Small: 10,000 citizens, ~50,000 events
    - Medium: 100,000 citizens, ~500,000 events
    - Large: 1,000,000 citizens, ~5,000,000 events

---

## Milestone 6 — OpenFn workflows

The point of the whole exercise: wire the systems together with OpenFn workflows
generated from the service-catalog prompts (Milestone 2), then put them under the
continuous load from Milestone 5 and measure how OpenFn holds up.

- [ ] **Build the workflows** — the connective tissue between systems, and the
      thing actually under test:
  - Event-driven: birth→citizen, newborn→patient+vaccinations, newborn→child-benefit, death→close records, marriage→link households+reassess, vaccination→reporting, enrollment→payments, any-event→notification
  - Scheduled: daily age-based eligibility, weekly missed-vaccination follow-up, duplicate-citizen detection
- [ ] **Point each system's `WEBHOOK_URL`** (wired in Milestone 3) at the
      matching OpenFn trigger, and verify each workflow end-to-end with a single
      event before running at scale.
- [ ] **Measure OpenFn under load:**
  - For each workflow: did OpenFn AI generate a working first draft from the prompt? How many manual edits were needed?
  - Workflow metrics — success / failure / timeout counts, retry behaviour, latency per execution
  - Error rate under the Milestone 5 load tiers; capture findings in `simulation/reports/`

---

## Milestone 7 — Build forms for services and connect to OpenFn

Turn the service stubs from Milestone 2 into working services: replace each
under-construction page with a real citizen-facing form and wire it through an
OpenFn workflow. This ticks off checklist items 2 and 3 on every service stub.

- [ ] **Build the user form per service** on the portal to initiate it —
      gov.uk-style (one question per page, validation, check-your-answers),
      replacing the under-construction page. (Checklist item 2.)
- [ ] **Connect each form to the systems via an OpenFn workflow** — submitting
      the form triggers the service's workflow (Milestone 6) rather than calling
      systems directly, so the portal exercises the same integration path under
      test. (Checklist item 3.)
- [ ] **Confirmation page per service** — gov.uk-style confirmation panel with a
      reference number once the workflow accepts the submission.
- [ ] **Flip each service's catalog checklist to complete** as its form and
      workflow connection land, so the service catalog reflects live status.

---

## Later / Backlog

Worth doing, but not part of the seven milestones above.

### Tests
- [ ] System API tests (vitest + supertest) — happy path per endpoint
- [ ] Cross-system integration tests — birth flow creates citizen, registers patient
- [ ] Simulation smoke test — generate 10 citizens, run one year, verify counts
- [ ] Portal build test — `next build` passes

### Seed data
- [ ] Run seed scripts in order: identity → civil-registry → health → benefits
- [ ] Root-level `npm run seed` that runs all seeds in sequence
- [ ] Ensure seed data is consistent across systems (same citizen IDs referenced)

### Webhook infrastructure (beyond the basic emission in Milestone 3)
- [ ] Retry logic (exponential backoff) for failed deliveries

### Notification system enhancements
- [ ] Staff notification lookup UI (`/staff/notifications`) — search by name / national ID, see delivery status, timestamps, channel
- [ ] Notification templates table (named templates instead of hardcoded bodies)
- [ ] Delivery simulation — realistic delays, failures, retries
- [ ] Notification preferences — citizen opt in/out per channel and category
- [ ] Batch digest — aggregate into daily/weekly digest emails
- [ ] Audit trail — track what triggered each notification

### Portal polish
- [ ] Error states — handle systems being down gracefully on all pages
- [ ] Mobile testing — verify responsive layout

### Deployment
- [ ] Fill in `docker-compose.yml`; add Dockerfiles per system
- [ ] Nginx reverse proxy; deploy to VPS
- [ ] OpenFn cloud connection; deploy portal to Vercel

### Database migration to Postgres
- [ ] Add Postgres Drizzle configs alongside SQLite
- [ ] Test each system with Postgres
- [ ] Update docker-compose with Postgres containers

---

## Key Decisions Still Open

1. **OpenFn setup** — OpenFn cloud or self-hosted Lightning? Determines webhook URL configuration.
2. **Auth** — Staff pages currently have no access control. When do we add it? (Tracked as a system-catalog stub in Milestone 1.)
3. **Real DPG swap** — When real systems (OpenCRVS, DHIS2, etc.) come online, the plan is to swap them in behind the same OpenFn workflows. Do we need adapter compatibility tests now?
</content>
</invoke>
