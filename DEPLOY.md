# Deploying SimDPG

SimDPG ships as a single Docker image (root `Dockerfile`) that builds the whole
monorepo once and runs **one** workspace per container, chosen at runtime via
environment variables. The same image runs locally (docker-compose) and on
Railway.

| Variable     | Purpose                                                          | Example                              |
| ------------ | ---------------------------------------------------------------- | ------------------------------------ |
| `SERVICE_DIR`| Workspace dir to run from. On Railway, derived from the service name | `systems/identity`, `portal`     |
| `START_CMD`  | Start command (default `node dist/index.js`; derived on Railway) | `npm run start` (portal)             |
| `SEED_CMD`   | Optional. Seed the DB **once** on a fresh volume (systems only)  | `npm run db:seed -w @simdpg/identity`|
| `PORT`       | Port to listen on (derived on Railway: 3001–3007; portal auto)   | `3001` … `3007`                      |
| `*_URL`      | Cross-service URLs — only the **portal** needs these             | see below                            |

On Railway, name a service after its workspace and `SERVICE_DIR`/`START_CMD`/
`SEED_CMD`/`PORT` are filled in automatically (see the Railway section). Locally,
docker-compose sets them explicitly.

Systems are independent (they don't call each other — they only emit webhooks
to an optional `WEBHOOK_URL`), so only the portal needs the `*_URL` variables.
Databases are SQLite files under each system's `data/` dir; that directory must
be backed by a persistent volume.

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

**It configures itself.** The image derives everything from the Railway service
name (`RAILWAY_SERVICE_NAME`, scope stripped) and the portal discovers the other
services from its own private domain. So you set **no** `SERVICE_DIR`,
`START_CMD`, `SEED_CMD`, `PORT`, or `*_URL` variables. Concretely:

- Each **system** runs its workspace, listens on its canonical port (3001–3007)
  regardless of the Railway-injected `PORT`, and seeds its database once.
- The **portal** runs Next.js on Railway's injected port and computes each
  system's private URL from its own `RAILWAY_PRIVATE_DOMAIN` — working with
  whatever naming scheme Railway used (`simdpgidentity.railway.internal` for
  `@simdpg/identity` names, `identity.railway.internal` for plain names).

For **every** service, just set:

- **Root Directory:** `/` (the monorepo root — required so the workspace install/build works)
- **Builder:** Dockerfile  •  **Dockerfile Path:** `Dockerfile`

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

Set `WEBHOOK_URL` on any system to have it deliver DCI CloudEvents there.
