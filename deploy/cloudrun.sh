#!/usr/bin/env bash
# One-time setup + deploy of MyGuru to Google Cloud Run. Run from the repo root after
# `gcloud auth login` and `gcloud config set project <PROJECT_ID>`.
# Secrets are read from Secret Manager; nothing secret lives in this repo.
set -euo pipefail

PROJECT_ID="$(gcloud config get-value project)"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-myguru}"
BUCKET="${BUCKET:-${PROJECT_ID}-myguru-db}"
REPO="${REPO:-myguru}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/myguru:$(git rev-parse --short HEAD)"
SA="myguru-run@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  cloudscheduler.googleapis.com cloudbuild.googleapis.com storage.googleapis.com

# Bucket for the Litestream replica (versioned so a bad write can be rolled back).
gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://${BUCKET}" --location="${REGION}" --uniform-bucket-level-access
gcloud storage buckets update "gs://${BUCKET}" --versioning

gcloud artifacts repositories describe "${REPO}" --location="${REGION}" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "${REPO}" --repository-format=docker --location="${REGION}"

gcloud iam service-accounts describe "${SA}" >/dev/null 2>&1 || \
  gcloud iam service-accounts create myguru-run --display-name="MyGuru Cloud Run"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --member="serviceAccount:${SA}" --role="roles/storage.objectAdmin" >/dev/null

# Secrets: create each once with `printf '%s' VALUE | gcloud secrets create NAME --data-file=-`
SECRETS=(SESSION_SECRET APP_PASSCODE ALLOWED_EMAIL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET CRON_SECRET HEALTH_SYNC_TOKEN VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY)
SET_SECRETS=""
for s in "${SECRETS[@]}"; do
  # A secret only counts once it has an enabled version; an empty one would fail the deploy.
  if gcloud secrets versions access latest --secret="$s" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:${SA}" --role="roles/secretmanager.secretAccessor" >/dev/null
    SET_SECRETS+="${s}=${s}:latest,"
  else
    echo "note: secret $s not found, skipping (create it to enable that feature)"
  fi
done
case ",${SET_SECRETS}" in
  *,SESSION_SECRET=*) ;;
  *) echo "error: secret SESSION_SECRET is missing. Create the secrets first (deploy-steps.md step 2)." >&2; exit 1 ;;
esac

gcloud builds submit --tag "${IMAGE}" .

# SQLite needs exactly one writer: min = max = 1 instance, no concurrency limits needed for one person.
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --service-account "${SA}" \
  --min-instances 1 --max-instances 1 \
  --cpu 1 --memory 512Mi --no-cpu-throttling \
  --allow-unauthenticated \
  --set-env-vars "LITESTREAM_BUCKET=${BUCKET},APP_TIMEZONE=${APP_TIMEZONE:-Asia/Kolkata},NEXT_PUBLIC_CURRENCY=${CURRENCY:-INR}${APP_URL:+,APP_URL=${APP_URL}}" \
  --set-secrets "${SET_SECRETS%,}"

echo "Deployed: $(gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)')"
echo "Next: set APP_URL to that URL (re-run with APP_URL=...), add <APP_URL>/api/auth/google/callback as an OAuth redirect URI, then run deploy/scheduler.sh"
