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
system's `data/` dir; that directory must be backed by a persistent volume.

## Local (docker-compose)

All services share one image (`simdpg:latest`). **Build it once, then start** —
this avoids rebuilding the image per service:

```bash
docker build -t simdpg:latest .   # build the shared image once
docker compose up                 # start all 7 systems + portal (reuses the image)
```

- Portal: http://localhost:3000  •  Systems: http://localhost:3001–3007 (`/health`, `/docs`)
- Each system's database is seeded automatically the first time its volume is created.
- `docker compose down` stops the stack (data preserved); `docker compose down -v` wipes all data.

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

Delete the non-server services Railway auto-creates (`@simdpg/system-kit`,
`@simdpg/api-clients`, `@simdpg/simulation`) — they aren't web servers.

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

#### Portal form submissions

Portal service forms (e.g. "Apply for a national ID", "Check benefit
eligibility") submit through a central point in the portal, which forwards each
submission to the webhook URL registered for that form. Manage these in the same
**Webhook registration** page under **Form submissions** — no redeploy needed.

Forms previously wired with an `OPENFN_*` environment variable
(`OPENFN_NATIONAL_ID_WEBHOOK_URL`, `OPENFN_BENEFIT_ELIGIBILITY_PART{1,2,3}_URL`)
keep working: the env var is used as a fallback until a URL is registered in the
staff area, which then takes precedence. New deployments should prefer the
registry.
