#!/bin/sh
# Runs one SimDPG workspace, selected at runtime.
#
#   SERVICE_DIR  workspace dir to run from, e.g. systems/identity
#   START_CMD    command to start the service (default: node dist/index.js)
#   SEED_CMD     optional seed command run once on a fresh data volume,
#                e.g. "npm run db:seed -w @simdpg/identity". A marker file
#                (data/.seeded) ensures it never re-runs on redeploy.
#
# On Railway, everything is derived from the service name (RAILWAY_SERVICE_NAME)
# so a service needs NO configuration beyond being named after its workspace
# (identity, portal, ...; an "@scope/" prefix is stripped). Crucially the system
# PORT is pinned from the name even when SERVICE_DIR is set explicitly — so a
# system is always reachable on its canonical port (3001-3007) and the portal
# can find it there with no per-service URL config. Explicit SERVICE_DIR /
# START_CMD / SEED_CMD still win (this is how docker-compose drives it locally).
set -e

# Workspace name from the Railway service name ("@simdpg/identity" -> "identity").
svc=""
[ -n "${RAILWAY_SERVICE_NAME:-}" ] && svc=${RAILWAY_SERVICE_NAME##*/}

# Name -> SERVICE_DIR (only if unset) and canonical PORT (always, for systems).
case "$svc" in
  portal)
    : "${SERVICE_DIR:=portal}"
    : "${START_CMD:=npm run start}"
    ;;                                  # portal keeps Railway's injected PORT
  identity)          : "${SERVICE_DIR:=systems/identity}";        export PORT=3001 ;;
  civil-registry)    : "${SERVICE_DIR:=systems/civil-registry}";  export PORT=3002 ;;
  health)            : "${SERVICE_DIR:=systems/health}";          export PORT=3003 ;;
  benefits)          : "${SERVICE_DIR:=systems/benefits}";        export PORT=3004 ;;
  notifications)     : "${SERVICE_DIR:=systems/notifications}";   export PORT=3005 ;;
  payments)          : "${SERVICE_DIR:=systems/payments}";        export PORT=3006 ;;
  social-registry)   : "${SERVICE_DIR:=systems/social-registry}"; export PORT=3007 ;;
  "")                : ;;              # not on Railway (e.g. docker-compose)
  *)
    echo "[entrypoint] WARN: no mapping for service '$svc'; relying on explicit SERVICE_DIR." >&2
    ;;
esac

# Systems get a one-time seed on a fresh volume unless told otherwise.
case "$svc" in
  ""|portal) : ;;
  *) [ -n "${SERVICE_DIR:-}" ] && : "${SEED_CMD:=npm run db:seed -w @simdpg/$svc}" ;;
esac

cd "/app/${SERVICE_DIR:?SERVICE_DIR not set and no RAILWAY_SERVICE_NAME mapping}"

if [ -n "${SEED_CMD:-}" ] && [ ! -f data/.seeded ]; then
  echo "[entrypoint] seeding ${SERVICE_DIR} (first boot on empty volume)..."
  mkdir -p data
  # Seed scripts live at the repo root's node_modules (tsx); run from /app.
  ( cd /app && eval "$SEED_CMD" )
  touch data/.seeded
fi

exec ${START_CMD:-node dist/index.js}
