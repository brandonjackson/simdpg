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

> **Escape hatches (rarely needed):** explicit `SERVICE_DIR` / `START_CMD` still
> win, and an explicit `IDENTITY_URL` (etc.) on the portal overrides the derived
> URL — e.g. to point at a system's public domain. The system `PORT` is always
> pinned from the service name so the portal can reach it.

### When something is wrong with a database

Every service keeps its data in a SQLite file on a mounted volume and creates
its tables at startup. When that goes wrong — the volume isn't mounted, it's
mounted read-only, or the database predates the schema the running build
queries — nothing throws. The service starts, answers every request, and
returns nothing, so the portal shows a population of 0 and no error anywhere.

The deployment reports that state instead of hiding it:

- `GET /admin/db-health` on any system — tables, columns, writability, and row
  counts for the tables that shouldn't be empty. Also summarised as `database`
  in that system's `/health`.
- `GET /api/health/database` on the portal — all eight databases at once (the
  portal's plus the seven systems'), answering 503 when any of them is broken,
  so an uptime check catches it too.
- A banner at the top of **every** portal page whenever one of them is
  unhealthy. **Red** is broken or unreachable, and names the service, the
  problem and the command to run. **Amber** is "working, but there is no
  population" — raised only when every system is empty — and links to the staff
  population page instead of a command, because nothing there is broken.

An amber banner needs no command: open **Staff → Population management** and
generate a population (or restore the sample records with the seed command
below). To fix a red one, open that service in Railway (the service → ⋮ →
Console) and run:

| Service | Command | What it does |
| --- | --- | --- |
| any system | `npm run db:seed -w @simdpg/<system>` | Rebuilds the schema, then seeds only if the database is empty |
| the portal | `npm run db:setup -w @simdpg/portal` | Creates the portal's tables, re-inserts the default project, reports what's left |

Both are idempotent and neither deletes anything, so they're safe to re-run.

Two problems they can't fix on their own, and what the banner says instead:

- **The file isn't writable.** Mount a volume at `/app/systems/<system>/data`
  (or `/app/portal/data`) and redeploy — until then every write fails while
  reads keep working, which is the most confusing version of this failure.
- **A column is missing.** The database was created by an older build and the
  schema bootstrap has no migration for that column. Add one with `ensureColumn`
  in that service's `src/db/index.ts` (see `packages/system-kit/src/migrations.ts`)
  and redeploy; `CREATE TABLE IF NOT EXISTS` alone will never add it.

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
