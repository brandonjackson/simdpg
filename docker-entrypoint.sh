#!/bin/sh
# Runs one SimDPG workspace, selected at runtime.
#
#   SERVICE_DIR  workspace dir to run from, e.g. systems/identity
#   START_CMD    command to start the service (default: node dist/index.js)
#   SEED_CMD     optional seed command run once on a fresh data volume,
#                e.g. "npm run db:seed -w @simdpg/identity". A marker file
#                (data/.seeded) ensures it never re-runs on redeploy.
#
# Used by docker-compose locally (which sets SERVICE_DIR / PORT / SEED_CMD
# explicitly). On Railway the platform runs `npm run start -w <workspace>`
# instead of this entrypoint, but if it ever does run here it still works: it
# derives the workspace from the service name and binds whatever PORT Railway
# injects (no canonical-port pinning), so the portal — which addresses systems
# on Railway's port — stays consistent. Explicit SERVICE_DIR / START_CMD /
# SEED_CMD always win.
set -e

# Workspace name from the Railway service name ("@simdpg/identity" -> "identity").
svc=""
[ -n "${RAILWAY_SERVICE_NAME:-}" ] && svc=${RAILWAY_SERVICE_NAME##*/}

# Name -> SERVICE_DIR (only if unset). Port is left to the environment.
case "$svc" in
  portal)
    : "${SERVICE_DIR:=portal}"
    : "${START_CMD:=npm run start}"
    ;;
  identity)          : "${SERVICE_DIR:=systems/identity}" ;;
  civil-registry)    : "${SERVICE_DIR:=systems/civil-registry}" ;;
  health)            : "${SERVICE_DIR:=systems/health}" ;;
  benefits)          : "${SERVICE_DIR:=systems/benefits}" ;;
  notifications)     : "${SERVICE_DIR:=systems/notifications}" ;;
  payments)          : "${SERVICE_DIR:=systems/payments}" ;;
  social-registry)   : "${SERVICE_DIR:=systems/social-registry}" ;;
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
