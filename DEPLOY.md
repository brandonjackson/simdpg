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

The image **configures itself from the Railway service name** (`RAILWAY_SERVICE_NAME`),
so the easiest, least error-prone setup is:

> **Name each service exactly after its workspace:** `identity`, `civil-registry`,
> `health`, `benefits`, `notifications`, `payments`, `social-registry`, `portal`.
> (A `@simdpg/identity` style name works too — the scope is stripped.)

With the right name, `SERVICE_DIR`, `START_CMD`, `SEED_CMD`, and the system `PORT`
are all derived automatically — **you set none of them**. A service whose name has
no mapping refuses to start (rather than silently running the default identity
system), so a misnamed service fails loudly.

For **every** service set:

- **Root Directory:** `/` (the monorepo root — required so the workspace install/build works)
- **Builder:** Dockerfile  •  **Dockerfile Path:** `Dockerfile`

For each **system** service (`identity` … `social-registry`):

- **Volume:** mount at `/app/systems/<name>/data` (e.g. `/app/systems/identity/data`)
- Listens privately on its canonical port (3001–3007); no public domain needed.

For the **portal** service:

- **Public domain:** add one and accept Railway's auto-detected port ("Railway magic").
  Do **not** pin `PORT` — Next.js binds Railway's injected port and the domain routes to it.
- **Variables: none required.** The portal detects Railway and derives each system's
  URL as `http://<service>.railway.internal:<port>` from the same name+port
  convention — **so there are no `*_URL` variables to set**, as long as the system
  services are named cleanly (`identity`, `civil-registry`, …).

> Manual `SERVICE_DIR` / `START_CMD` / `PORT` still override the name-based
> defaults if you ever need a custom setup. Likewise, an explicit `IDENTITY_URL`
> (etc.) on the portal overrides the derived URL — useful if a system service is
> named differently or you want to point at its public domain.

### Optional: webhooks for OpenFn

Set `WEBHOOK_URL` on any system to have it deliver DCI CloudEvents there.
