#!/usr/bin/env bash
# Idempotent setup for the Chronos-2 forecast job in europe-west2.
# Runs standalone, or sourced from warehouse/bootstrap.sh with --with-forecast.
# Never creates or downloads service-account keys.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-the-ordinary-512212}"
LOCATION="${LOCATION:-europe-west2}"
FORECAST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORECASTER_NAME="ordinary-forecaster"
FORECASTER="${FORECASTER_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
JOB_NAME="ordinary-forecast"
EXPERIMENT_ID="${EXPERIMENT_ID:-barbara-dry-run}"

if ! declare -F say >/dev/null; then
  say() { printf '%s\n' "$*"; }
fi
if ! declare -F die >/dev/null; then
  die() { printf 'forecast setup: %s\n' "$*" >&2; exit 1; }
fi

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
  die "Not signed in. Run: gcloud auth login"
fi
gcloud config set project "$PROJECT_ID" >/dev/null

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

if ! declare -F ensure_sa >/dev/null; then
  ensure_sa() {
    local name="$1"
    if gcloud iam service-accounts describe "${name}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" >/dev/null 2>&1; then
      say "Service account exists: $name"
    else
      gcloud iam service-accounts create "$name" --project="$PROJECT_ID" --display-name="$name"
    fi
  }
fi

# Same dataset access-list method as warehouse/bootstrap.sh. Dataset IAM
# bindings are not allowlisted on this project.
if ! declare -F grant_dataset >/dev/null; then
  grant_dataset() {
    local dataset="$1" member="$2" role="$3"
    local primitive
    case "$role" in
      roles/bigquery.dataEditor) primitive="WRITER" ;;
      roles/bigquery.dataViewer) primitive="READER" ;;
      roles/bigquery.dataOwner) primitive="OWNER" ;;
      WRITER|READER|OWNER) primitive="$role" ;;
      *) die "Unknown dataset role: $role" ;;
    esac
    local src dst action
    src="$(mktemp)"
    dst="$(mktemp)"
    bq --project_id="$PROJECT_ID" show --format=prettyjson "${PROJECT_ID}:${dataset}" >"$src"
    action="$(
      DATASET_JSON="$src" OUT_JSON="$dst" MEMBER="$member" ROLE="$primitive" python3 - <<'PY'
import json, os
with open(os.environ["DATASET_JSON"]) as f:
    ds = json.load(f)
member = os.environ["MEMBER"]
role = os.environ["ROLE"]
access = list(ds.get("access") or [])
for entry in access:
    if entry.get("userByEmail") == member and entry.get("role") == role:
        print("exists")
        raise SystemExit
access.append({"role": role, "userByEmail": member})
payload = {"access": access}
for key in ("defaultTableExpirationMs", "description", "labels"):
    if key in ds:
        payload[key] = ds[key]
with open(os.environ["OUT_JSON"], "w") as f:
    json.dump(payload, f)
print("update")
PY
    )"
    if [[ "$action" == "update" ]]; then
      bq update --source="$dst" "${PROJECT_ID}:${dataset}"
      say "Granted $primitive on $dataset to $member"
    else
      say "Access exists: $primitive on $dataset for $member"
    fi
    rm -f "$src" "$dst"
  }
fi

ensure_sa "$FORECASTER_NAME"

grant_dataset ordinary_features "$FORECASTER" roles/bigquery.dataViewer
grant_dataset ordinary_core "$FORECASTER" roles/bigquery.dataViewer
# WRITER includes read on ordinary_effects.
grant_dataset ordinary_effects "$FORECASTER" roles/bigquery.dataEditor

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${FORECASTER}" \
  --role="roles/bigquery.jobUser" --condition=None >/dev/null

say "Deploying Cloud Run job $JOB_NAME from source in $LOCATION (first build takes several minutes)"
if ! gcloud run jobs deploy "$JOB_NAME" \
  --source "$FORECAST_DIR" \
  --region "$LOCATION" \
  --project "$PROJECT_ID" \
  --service-account "$FORECASTER" \
  --cpu 2 --memory 4Gi --task-timeout 1800 --max-retries 1 \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID},BQ_LOCATION=${LOCATION},EXPERIMENT_ID=${EXPERIMENT_ID},WINDOW_DAYS=7,MIN_FULL_DAYS=14,MIN_LIMITED_DAYS=5"; then
  die "Cloud Run deploy failed. If the error names Cloud Build or Artifact Registry permissions, stop and report the exact role it asks for."
fi

say "Forecast job ready: gcloud run jobs execute $JOB_NAME --region $LOCATION --wait   (pnpm forecast:run)"
