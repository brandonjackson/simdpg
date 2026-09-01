# Deploying SimDPG

SimDPG ships as a single Docker image (root `Dockerfile`) that builds the whole
monorepo once. It runs **one** workspace per container, selected two ways:

- **docker-compose (local):** the image entrypoint picks the workspace from
  these variables, which compose sets per service.
- **Railway:** the platform runs `npm run start -w <workspace>` per service;
  each system's `start` script seeds-then-serves, the portal serves Next.js.

| Variable     | Purpose                                                          | Example                              |
| ------------ | ---------------------------------------------------------------- | ------------------------------------ |
| `SERVICE_DIR`| (compose) workspace dir to run from                              | `systems/identity`, `portal`         |
| `START_CMD`  | (compose) start command (default `node dist/index.js`)           | `npm run start` (portal)             |
| `SEED_CMD`   | (compose) seed the DB **once** on a fresh volume (systems only)  | `npm run db:seed -w @simdpg/identity`|
| `PORT`       | Port to listen on (compose sets 3001–3007; Railway injects 8080) | `3001` … `3007`                      |
| `*_URL`      | Override a system's URL; auto-derived otherwise                  | see below                            |
| `REDIS_URL`  | Redis connection (queue groundwork; unused today)                | `redis://redis:6379`                 |

Systems are independent (they don't call each other — they only emit webhooks
to an optional `WEBHOOK_URL`), so only the portal needs to reach the systems —
and it derives those URLs automatically. Databases are SQLite files under each
system's `data/` dir; that directory must be backed by a persistent volume. The
**portal now has a database too** — `portal/data/simulations.sqlite`, holding
simulation records, their generated event scripts, run-state, and the
form-webhook registry — so it likewise needs a persistent volume (override the
path with `PORTAL_DB_FILE`).

## Local (docker-compose)

All services share one image (`simdpg:latest`). **Build it once, then start** —
this avoids rebuilding the image per service:

```bash
docker build -t simdpg:latest .   # build the shared image once
docker compose up                 # start all 7 systems + portal (reuses the image)
```

- Portal: http://localhost:3000  •  Systems: http://localhost:3001–3007 (`/health`, `/docs`)
- Each system's database is seeded automatically the first time its volume is created.
- The portal's own database lives on the `portal-data` volume (`/app/portal/data`).
- `docker compose down` stops the stack (data preserved); `docker compose down -v` wipes all data.

### Seeding is one-shot — reference data must not depend on it

Seeding runs **once per volume**: `SEED_CMD` is skipped when `data/.seeded`
exists, and each system's seed script also skips a database that already has
rows. Both markers live on the persistent volume, so once a volume has been
seeded the seed never runs again — a table emptied afterwards (by hand, or by a
`/admin/reset`) stays empty for the life of that volume.

That is fine for population data, which the simulation engine and the staff
population page own. It is **not** fine for reference data that integrations
address by ID: benefit programmes went missing from the live sandbox this way,
and every OpenFn workflow doing `GET /programs/{id}` broke with
`404 Program not found`.

So benefit programmes have **stable, hard-coded IDs** and are re-created on
every server start, not just by the seed — see
`systems/benefits/src/db/reference-data.ts`. Any future reference data should
follow the same pattern rather than relying on the seed to be there.

### Redis

The stack includes a `redis:7-alpine` service, groundwork for the queue-based
simulation worker pool (`docs/specs/2026-07-19-queued-event-delivery-design.md`).
**Nothing consumes it yet** — the portal is given `REDIS_URL` ahead of the queue
work but does not read it.

It has **no volume on purpose**: queued jobs are meaningless once a run ends, so
persisting them would only replay stale work after a restart.

Port 6379 is published to the host so you can keep the fast local dev loop
(`npm run dev`, hot reload) and run only Redis in Docker:

```bash
docker compose up redis                          # just Redis
npm run sim:redis-ping -w @simdpg/simulation     # expect: Redis replied: PONG
```

With no `REDIS_URL` set, the client defaults to `redis://localhost:6379`, so
that works with no `.env` changes.

> **Don't use `docker compose up --build` unless you have the Buildx/BuildKit
> plugin.** With BuildKit, Compose builds the shared image once. With Docker's
> *legacy* builder (no buildx), Compose builds the image **once per service, in
> parallel** — 7 simultaneous `npm ci` runs that can exhaust memory and get
> OOM-killed (exit 137). Building once with `docker build` first sidesteps this
> entirely. On a low-memory VM (e.g. Colima default 2 GB), also give it room:
> `colima stop && colima start --cpu 4 --memory 8`.

## Railway

One project, **8 services** (7 systems + portal), all deployed from this repo.
Railway's monorepo detection creates one service per workspace and names each
after the workspace (`@simdpg/identity`, `@simdpg/portal`, …) — **leave those
names as they are.** No renaming, no editing private-networking names, ever.

**It configures itself.** Railway runs each service with its monorepo-detected
command `npm run start -w <workspace>`, and the repo makes that command do the
right thing — so you set **no** `SERVICE_DIR`, `PORT`, or `*_URL` variables.
Concretely:

- Each **system**'s `start` script seeds its database (idempotent — a no-op once
  seeded) and then serves on Railway's injected `PORT` (8080).
- The **portal**'s `start` script (`next start`) serves on Railway's injected
  `PORT`, and it computes each system's private URL from its own
  `RAILWAY_PRIVATE_DOMAIN` — `http://<sibling>.railway.internal:8080` — working
  with whatever naming scheme Railway used (`simdpgidentity.railway.internal`
  for `@simdpg/identity` names, `identity.railway.internal` for plain names).

The repo's **`railway.json`** pins the **builder** to the Dockerfile (so the
monorepo build order is correct and the original `@simdpg/system-kit` build
error can't recur). The Dockerfile-built image already contains every
workspace's `dist`, so `npm run start -w <workspace>` just runs `node dist`.

For **every** service, just set:

- **Root Directory:** `/` (the monorepo root — required so the workspace install/build works)

For each **system** service, also add:

- **Volume:** mount at `/app/systems/<workspace>/data` (e.g. `/app/systems/identity/data`)

For the **portal** service, also:

- **Public domain:** add one and accept Railway's auto-detected port. Do **not**
  pin `PORT`.
- **Volume:** mount at `/app/portal/data` so the portal's SQLite database
  (simulation records, their event scripts, run-state, and the form-webhook
  registry) survives redeploys. Without it, simulations and registered form
  webhooks are wiped on every deploy. (Override the file location with
  `PORTAL_DB_FILE` if you mount elsewhere.)

  Everything a simulation needs is in that one file, so a redeploy can no longer
  keep a record while losing what it runs. Event scripts used to be written to
  `/app/portal/.simulations/`, outside the volume: a redeploy left simulations
  reading "generated" whose scripts were gone, and starting one failed
  immediately with `ENOENT ... .events.json`. A simulation left in that state by
  an older build can be generated again from its detail page — the button says
  so — which gives it a script that lasts. Only the per-run worker logs
  (`.simulations/<id>.log`) are still written outside the volume; losing them
  costs a finished run's console output, nothing more.

Delete the non-server services Railway auto-creates (`@simdpg/system-kit`,
`@simdpg/api-clients`, `@simdpg/simulation`) — they aren't web servers.

### Redis on Railway

Redis is the one piece that does **not** configure itself. Add it from
Railway's database templates — it's a 9th service, not built from this repo —
and set `REDIS_URL` on the portal from the Redis service's own connection
variable, using a reference so it tracks Railway's value:

```
REDIS_URL=${{Redis.REDIS_URL}}
```

It is the first variable this deployment actually requires you to wire by hand.

> **The IPv6 gotcha.** `ioredis` (and therefore BullMQ) does an IPv4-only DNS
> lookup by default, which cannot resolve `*.railway.internal` in environments
> created before 2025-10-16 — those are IPv6-only. It surfaces as `ENOTFOUND`
> against a URL that is completely correct. `simulation/src/engine/redis.ts`
> sets `family: 0` (dual-stack lookup) to avoid this; don't remove it.
> See https://docs.railway.com/reference/errors/enotfound-redis-railway-internal

> **Escape hatches (rarely needed):** explicit `SERVICE_DIR` / `START_CMD` still
> win, and an explicit `IDENTITY_URL` (etc.) on the portal overrides the derived
> URL — e.g. to point at a system's public domain. The system `PORT` is always
> pinned from the service name so the portal can reach it.

### Optional: webhooks for OpenFn

Each system delivers DCI CloudEvents to the per-event targets registered in its
`/admin/webhook-subscriptions` registry — manage these from the portal staff
area under **Webhook registration** (`/staff/webhooks`). An event is delivered
to every URL registered for its type, so it can fan out to several workflows.

`WEBHOOK_URL`, if set on a system, is still honoured as an additional catch-all
target that receives every event regardless of type (backwards compatible).

#### Projects

Webhook registrations are grouped into projects — one project per set of URLs,
normally one OpenFn project. Manage them in the staff area under **Projects**
(`/staff/projects`): add, duplicate, rename, delete. A simulation picks the
project it delivers to when it's created, so several cloned OpenFn projects can
be driven from one portal.

A fresh (or upgraded) database always contains a project called "Default
project", flagged as the default: live citizen-facing form submissions go to it,
and any registration that predates projects is migrated onto it on first start.
No manual migration step is needed.

#### Portal form submissions

Portal service forms (e.g. "Apply for a national ID", "Check benefit
eligibility") submit through a central point in the portal, which forwards each
submission to the webhook URL registered for that form *in the default project*.
Manage these in the same **Webhook registration** page under **Form
submissions**, after choosing the project at the top — no redeploy needed.

Forms previously wired with an `OPENFN_*` environment variable
(`OPENFN_NATIONAL_ID_WEBHOOK_URL`, `OPENFN_BENEFIT_ELIGIBILITY_PART{1,2,3}_URL`)
keep working: the env var is used as a fallback until a URL is registered in the
staff area, which then takes precedence. New deployments should prefer the
registry. The fallback applies to the default project only — other projects exist
to name their own endpoints, so they never borrow the legacy URL.

Registered URLs are stored in the portal's SQLite database
(`portal/data/simulations.sqlite`, in the `form_webhooks` table, keyed by project
and form), alongside the `projects` table, simulation records, event scripts and
run-state.
Mount a persistent volume at `/app/portal/data` (see the portal service above) so
projects and registrations survive redeploys; override the database path with
`PORTAL_DB_FILE` if you mount elsewhere. If a save can't be written, the staff UI
reports the error instead of silently dropping it — keep the `OPENFN_*` env vars
set as a durable baseline if you don't mount a volume.
