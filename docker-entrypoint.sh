#!/bin/sh
# Runs one SimDPG workspace, selected at runtime.
#
#   SERVICE_DIR  workspace dir to run from, e.g. systems/identity (required)
#   START_CMD    command to start the service (default: node dist/index.js)
#   SEED_CMD     optional seed command run once on a fresh data volume,
#                e.g. "npm run db:seed -w @simdpg/identity". A marker file
#                (data/.seeded) ensures it never re-runs on redeploy.
set -e

cd "/app/${SERVICE_DIR:?SERVICE_DIR not set}"

if [ -n "${SEED_CMD:-}" ] && [ ! -f data/.seeded ]; then
  echo "[entrypoint] seeding ${SERVICE_DIR} (first boot on empty volume)..."
  mkdir -p data
  # Seed scripts live at the repo root's node_modules (tsx); run from /app.
  ( cd /app && eval "$SEED_CMD" )
  touch data/.seeded
fi

exec ${START_CMD:-node dist/index.js}
