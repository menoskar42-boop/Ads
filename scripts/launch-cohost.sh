#!/usr/bin/env bash
# Co-host launcher for the Reserved VM.
#
# Runs the mybible app as its OWN process on an internal port, then runs
# OscarDevs (the main/foreground process). OscarDevs' host gateway proxies
# mybible.oscardevs.com to that internal port, so one VM hosts both apps.
#
# CRITICAL: mybible must use ITS OWN database + session secret, NOT OscarDevs'.
# Both apps read process.env.DATABASE_URL / SESSION_SECRET, so on one VM those
# would collide. We therefore pass mybible's own values (from MYBIBLE_* vars)
# into the child process explicitly. Keeping mybible's SESSION_SECRET unchanged
# is what keeps the 700 members logged in — do NOT let it inherit OscarDevs'.
#
# Enable by setting these on the VM, then pointing the deployment "run" command
# at this script (build command must build mybible first — see mybible/CO_HOST.md):
#   MYBIBLE_DATABASE_URL   = mybible's production DATABASE_URL   (required)
#   MYBIBLE_SESSION_SECRET = mybible's existing SESSION_SECRET    (required)
#   MYBIBLE_UPSTREAM       = http://127.0.0.1:5001               (turns the gateway on)
#   MYBIBLE_PORT           = 5001                                (optional; default 5001)
#   (OPENAI_API_KEY / GROQ_API_KEY are shared, inherited as-is.)
set -uo pipefail
cd "$(dirname "$0")/.."

MYBIBLE_PORT="${MYBIBLE_PORT:-5001}"

if [ -n "${MYBIBLE_DATABASE_URL:-}" ] && [ -f mybible/dist/index.cjs ]; then
  echo "[co-host] starting mybible on 127.0.0.1:${MYBIBLE_PORT}"
  (
    cd mybible
    env \
      NODE_ENV=production \
      PORT="${MYBIBLE_PORT}" \
      DATABASE_URL="${MYBIBLE_DATABASE_URL}" \
      SESSION_SECRET="${MYBIBLE_SESSION_SECRET:?set MYBIBLE_SESSION_SECRET to the mybible session secret}" \
      VAPID_PUBLIC_KEY="${MYBIBLE_VAPID_PUBLIC_KEY:-${VAPID_PUBLIC_KEY:-}}" \
      VAPID_PRIVATE_KEY="${MYBIBLE_VAPID_PRIVATE_KEY:-${VAPID_PRIVATE_KEY:-}}" \
      CRON_SECRET="${MYBIBLE_CRON_SECRET:-${CRON_SECRET:-}}" \
      node dist/index.cjs
  ) &
  MYBIBLE_PID=$!
  # If OscarDevs exits, take mybible down too (so the VM restarts cleanly).
  trap 'kill "${MYBIBLE_PID}" 2>/dev/null' EXIT
else
  echo "[co-host] mybible not started (MYBIBLE_DATABASE_URL unset or mybible/dist missing) — OscarDevs only"
fi

exec node server.js
