# syntax=docker/dockerfile:1
#
# Single image for the whole SimDPG monorepo. Which workspace runs is chosen at
# RUNTIME via env vars (SERVICE_DIR / START_CMD), so every service — locally
# (docker compose) and on Railway — uses this one image and differs only by
# configuration. See docker-entrypoint.sh.

############################
# Stage 1: install + build
############################
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Toolchain for the better-sqlite3 native module.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first so `npm ci` is cached until dependencies change.
COPY package.json package-lock.json tsconfig.json ./
COPY packages/api-clients/package.json packages/api-clients/
COPY packages/system-kit/package.json packages/system-kit/
COPY portal/package.json portal/
COPY simulation/package.json simulation/
COPY systems/benefits/package.json systems/benefits/
COPY systems/civil-registry/package.json systems/civil-registry/
COPY systems/health/package.json systems/health/
COPY systems/identity/package.json systems/identity/
COPY systems/notifications/package.json systems/notifications/
COPY systems/payments/package.json systems/payments/
COPY systems/social-registry/package.json systems/social-registry/

RUN npm ci

# Bring in the rest of the source and build everything. The shared packages are
# built first because every system imports @simdpg/system-kit (and the portal
# imports @simdpg/api-clients) — building them up front is what the failed
# Railway/Railpack build was missing.
COPY . .
RUN npm run build -w @simdpg/system-kit \
 && npm run build -w @simdpg/api-clients \
 && npm run build --workspaces --if-present

############################
# Stage 2: runtime
############################
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy the whole built tree (compiled output + node_modules with intact
# workspace symlinks + the already-compiled native module + tsx for seeding).
COPY --from=build /app /app

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Defaults target the identity system; override SERVICE_DIR / START_CMD per service.
ENV SERVICE_DIR=systems/identity
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
