#!/bin/sh
# Runs one SimDPG workspace, selected at runtime.
#
#   SERVICE_DIR  workspace dir to run from, e.g. systems/identity
#   START_CMD    command to start the service (default: node dist/index.js)
#   SEED_CMD     optional seed command run once on a fresh data volume,
#                e.g. "npm run db:seed -w @simdpg/identity". A marker file
#                (data/.seeded) ensures it never re-runs on redeploy.
#
# If SERVICE_DIR is not set, it (and START_CMD/SEED_CMD/PORT) are derived from
# the Railway service name (RAILWAY_SERVICE_NAME) — so a service simply named
# "identity", "portal", etc. runs the right workspace with no extra config.
# An explicit SERVICE_DIR (e.g. from docker-compose) always takes precedence.
set -e

if [ -z "${SERVICE_DIR:-}" ] && [ -n "${RAILWAY_SERVICE_NAME:-}" ]; then
  svc=${RAILWAY_SERVICE_NAME##*/}   # strip any "@simdpg/" scope prefix
  case "$svc" in
    portal)
      SERVICE_DIR=portal
      START_CMD=${START_CMD:-npm run start}
      ;;
    identity)          SERVICE_DIR=systems/identity;         export PORT=3001 ;;
    civil-registry)    SERVICE_DIR=systems/civil-registry;   export PORT=3002 ;;
    health)            SERVICE_DIR=systems/health;           export PORT=3003 ;;
    benefits)          SERVICE_DIR=systems/benefits;         export PORT=3004 ;;
    notifications)     SERVICE_DIR=systems/notifications;    export PORT=3005 ;;
    payments)          SERVICE_DIR=systems/payments;         export PORT=3006 ;;
    social-registry)   SERVICE_DIR=systems/social-registry;  export PORT=3007 ;;
    *)
      echo "[entrypoint] WARN: no mapping for service '$svc'; set SERVICE_DIR explicitly." >&2
      ;;
  esac
  # Systems get a one-time seed on a fresh volume unless told otherwise.
  case "$svc" in
    portal) : ;;
    *) [ -n "$SERVICE_DIR" ] && : "${SEED_CMD:=npm run db:seed -w @simdpg/$svc}" ;;
  esac
fi

cd "/app/${SERVICE_DIR:?SERVICE_DIR not set and no RAILWAY_SERVICE_NAME mapping}"

if [ -n "${SEED_CMD:-}" ] && [ ! -f data/.seeded ]; then
  echo "[entrypoint] seeding ${SERVICE_DIR} (first boot on empty volume)..."
  mkdir -p data
  # Seed scripts live at the repo root's node_modules (tsx); run from /app.
  ( cd /app && eval "$SEED_CMD" )
  touch data/.seeded
fi

exec ${START_CMD:-node dist/index.js}
