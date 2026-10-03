#!/usr/bin/env bash
# Cloud Scheduler jobs that call MyGuru's protected job endpoints.
# Usage: APP_URL=https://myguru-xxxx.a.run.app CRON_SECRET=... deploy/scheduler.sh
set -euo pipefail
REGION="${REGION:-asia-south1}"
TZ_NAME="${APP_TIMEZONE:-Asia/Kolkata}"
: "${APP_URL:?set APP_URL}" "${CRON_SECRET:?set CRON_SECRET}"

job() { # name schedule
  local name="myguru-$1"
  local args=(--location "$REGION" --schedule "$2" --time-zone "$TZ_NAME" --uri "${APP_URL}/api/jobs/$1" --http-method POST --headers "Authorization=Bearer ${CRON_SECRET}" --attempt-deadline 300s)
  if gcloud scheduler jobs describe "$name" --location "$REGION" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$name" "${args[@]}"
  else
    gcloud scheduler jobs create http "$name" "${args[@]}"
  fi
}

job morning-briefing   "30 5 * * *"         # before the morning ritual
job calendar-sync      "*/15 6-22 * * *"
job meeting-reminders  "*/5 7-21 * * 1-5"
job portfolio-refresh  "*/15 9-15 * * 1-5"  # Indian market hours; adjust for your exchange
job evening-nudge      "0 20 * * *"
job weekly-review      "0 19 * * 0"         # Sunday evening
job housekeeping       "15 3 * * *"
