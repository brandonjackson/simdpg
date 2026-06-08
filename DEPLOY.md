# Deploying SimDPG

SimDPG ships as a single Docker image (root `Dockerfile`) that builds the whole
monorepo once and runs **one** workspace per container, chosen at runtime via
environment variables. The same image runs locally (docker-compose) and on
Railway.

| Variable     | Purpose                                                          | Example                              |
| ------------ | ---------------------------------------------------------------- | ------------------------------------ |
| `SERVICE_DIR`| Workspace dir to run from (required)                             | `systems/identity`, `portal`         |
| `START_CMD`  | Start command (default `node dist/index.js`)                     | `npm run start` (portal)             |
| `SEED_CMD`   | Optional. Seed the DB **once** on a fresh volume (systems only)  | `npm run db:seed -w @simdpg/identity`|
| `PORT`       | Port to listen on                                                | `3001` … `3007`, portal: any         |
| `*_URL`      | Cross-service URLs — only the **portal** needs these             | see below                            |

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
For each service set:

- **Root Directory:** `/` (the monorepo root — required so the workspace install/build works)
- **Builder:** Dockerfile  •  **Dockerfile Path:** `Dockerfile`
- **Variables:** per the table below
- **Volume** (systems only): mount at `/app/<SERVICE_DIR>/data`
- **Networking:** systems stay private; give only the **portal** a public domain

Systems reach nothing else, and the portal reaches systems over Railway's private
network at `http://<service>.railway.internal:<PORT>`.

| Service          | `PORT` | `SERVICE_DIR`            | `SEED_CMD` (`npm run db:seed -w …`) | `START_CMD`      | Volume mount                         |
| ---------------- | ------ | ------------------------ | ----------------------------------- | ---------------- | ------------------------------------ |
| identity         | 3001   | systems/identity         | `@simdpg/identity`                  | *(default)*      | `/app/systems/identity/data`         |
| civil-registry   | 3002   | systems/civil-registry   | `@simdpg/civil-registry`            | *(default)*      | `/app/systems/civil-registry/data`   |
| health           | 3003   | systems/health           | `@simdpg/health`                    | *(default)*      | `/app/systems/health/data`           |
| benefits         | 3004   | systems/benefits         | `@simdpg/benefits`                  | *(default)*      | `/app/systems/benefits/data`         |
| notifications    | 3005   | systems/notifications    | `@simdpg/notifications`             | *(default)*      | `/app/systems/notifications/data`    |
| payments         | 3006   | systems/payments         | `@simdpg/payments`                  | *(default)*      | `/app/systems/payments/data`         |
| social-registry  | 3007   | systems/social-registry  | `@simdpg/social-registry`           | *(default)*      | `/app/systems/social-registry/data`  |
| portal           | *(let Railway inject)* | portal     | *(none)*                            | `npm run start`  | *(none)*                             |

Set these `*_URL` variables on the **portal** service (pin each system's `PORT`
so the internal URLs are stable):

```
IDENTITY_URL=http://identity.railway.internal:3001
CIVIL_REGISTRY_URL=http://civil-registry.railway.internal:3002
HEALTH_URL=http://health.railway.internal:3003
BENEFITS_URL=http://benefits.railway.internal:3004
NOTIFICATIONS_URL=http://notifications.railway.internal:3005
PAYMENTS_URL=http://payments.railway.internal:3006
SOCIAL_REGISTRY_URL=http://social-registry.railway.internal:3007
```

> If a `*_URL` is missing on the portal it silently falls back to `localhost` and
> will fail in production. Set all seven.

### Optional: webhooks for OpenFn

Set `WEBHOOK_URL` on any system to have it deliver DCI CloudEvents there.
