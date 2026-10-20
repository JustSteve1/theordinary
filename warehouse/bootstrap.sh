#!/usr/bin/env bash
# Idempotent bootstrap for project the-ordinary-512212 in europe-west2.
# Never creates or downloads service-account keys.
set -euo pipefail

PROJECT_ID="the-ordinary-512212"
LOCATION="europe-west2"
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/bootstrap.out.env"

DATASETS=(
  ordinary_raw
  ordinary_core
  ordinary_features
  ordinary_experiments
  ordinary_effects
  ordinary_effects_test
)

say() { printf '%s\n' "$*"; }
die() { printf 'bootstrap: %s\n' "$*" >&2; exit 1; }

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
  die "Not signed in. Run: gcloud auth login && gcloud auth application-default login"
fi

gcloud config set project "$PROJECT_ID" >/dev/null

BILLING_ENABLED="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)"
BILLING_ACCOUNT="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null || true)"
if [[ "$BILLING_ENABLED" != "True" ]]; then
  die "Billing is not enabled on $PROJECT_ID. Enable billing, then re-run."
fi
BILLING_ID="${BILLING_ACCOUNT#billingAccounts/}"
say "Billing account: $BILLING_ID"

APIS=(
  bigquery.googleapis.com
  bigquerystorage.googleapis.com
  bigquerydatatransfer.googleapis.com
  iam.googleapis.com
  iamcredentials.googleapis.com
  sts.googleapis.com
  cloudresourcemanager.googleapis.com
  logging.googleapis.com
  billingbudgets.googleapis.com
)
gcloud services enable "${APIS[@]}" --project="$PROJECT_ID"

for dataset in "${DATASETS[@]}"; do
  if bq --project_id="$PROJECT_ID" show --dataset "$dataset" >/dev/null 2>&1; then
    say "Dataset exists: $dataset"
  else
    extra=()
    if [[ "$dataset" == "ordinary_effects_test" ]]; then
      extra+=(--default_table_expiration 2592000)
    fi
    bq --location="$LOCATION" mk --dataset "${extra[@]}" --project_id="$PROJECT_ID" "$dataset"
    say "Created dataset: $dataset"
  fi
done

ensure_sa() {
  local name="$1"
  if gcloud iam service-accounts describe "${name}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" >/dev/null 2>&1; then
    say "Service account exists: $name"
  else
    gcloud iam service-accounts create "$name" --project="$PROJECT_ID" --display-name="$name"
  fi
}

ensure_sa ordinary-vercel-writer
ensure_sa ordinary-dataform

WRITER="ordinary-vercel-writer@${PROJECT_ID}.iam.gserviceaccount.com"
DATAFORM="ordinary-dataform@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
USER="$(gcloud config get-value account)"

# Dataset IAM conditions are not allowlisted on this project. Grant the
# primitive dataset role through the access list instead.
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

grant_dataset ordinary_raw "$WRITER" roles/bigquery.dataEditor
grant_dataset ordinary_experiments "$WRITER" roles/bigquery.dataEditor
grant_dataset ordinary_raw "$DATAFORM" roles/bigquery.dataViewer
grant_dataset ordinary_experiments "$DATAFORM" roles/bigquery.dataViewer
for dataset in ordinary_core ordinary_features ordinary_effects ordinary_effects_test; do
  grant_dataset "$dataset" "$DATAFORM" roles/bigquery.dataEditor
done

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${WRITER}" \
  --role="roles/bigquery.jobUser" --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DATAFORM}" \
  --role="roles/bigquery.jobUser" --condition=None >/dev/null

gcloud iam service-accounts add-iam-policy-binding "$WRITER" \
  --member="user:${USER}" \
  --role="roles/iam.serviceAccountTokenCreator" --project="$PROJECT_ID" >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$DATAFORM" \
  --member="user:${USER}" \
  --role="roles/iam.serviceAccountTokenCreator" --project="$PROJECT_ID" >/dev/null

: "${VERCEL_TEAM_SLUG:?Set VERCEL_TEAM_SLUG to the team slug in the Vercel project URL, with OIDC issuer mode set to Team.}"
VERCEL_PROJECT_SLUG="${VERCEL_PROJECT_SLUG:-theordinary}"

gcloud iam workload-identity-pools describe vercel --location=global --project="$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create vercel \
    --location=global --project="$PROJECT_ID" --display-name="Vercel"

gcloud iam workload-identity-pools providers describe vercel \
  --workload-identity-pool=vercel --location=global --project="$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc vercel \
    --workload-identity-pool=vercel \
    --location=global \
    --project="$PROJECT_ID" \
    --issuer-uri="https://oidc.vercel.com/${VERCEL_TEAM_SLUG}" \
    --allowed-audiences="https://vercel.com/${VERCEL_TEAM_SLUG}" \
    --attribute-mapping="google.subject=assertion.sub"

# Issuer and audience follow the team. A re-run updates them in place.
gcloud iam workload-identity-pools providers update-oidc vercel \
  --workload-identity-pool=vercel \
  --location=global \
  --project="$PROJECT_ID" \
  --issuer-uri="https://oidc.vercel.com/${VERCEL_TEAM_SLUG}" \
  --allowed-audiences="https://vercel.com/${VERCEL_TEAM_SLUG}" \
  --attribute-mapping="google.subject=assertion.sub" >/dev/null

VERCEL_PRINCIPAL="principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/vercel/subject/owner:${VERCEL_TEAM_SLUG}:project:${VERCEL_PROJECT_SLUG}:environment:production"
gcloud iam service-accounts add-iam-policy-binding "$WRITER" \
  --member="$VERCEL_PRINCIPAL" \
  --role="roles/iam.workloadIdentityUser" \
  --project="$PROJECT_ID" >/dev/null || say "Vercel WIF binding needs the confirmed team slug. Re-run after VERCEL_TEAM_SLUG is correct."

gcloud iam workload-identity-pools describe github --location=global --project="$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create github \
    --location=global --project="$PROJECT_ID" --display-name="GitHub"

gcloud iam workload-identity-pools providers describe github \
  --workload-identity-pool=github --location=global --project="$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc github \
    --workload-identity-pool=github \
    --location=global \
    --project="$PROJECT_ID" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='JustSteve1/theordinary'"

GITHUB_PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/JustSteve1/theordinary"
gcloud iam service-accounts add-iam-policy-binding "$DATAFORM" \
  --member="$GITHUB_PRINCIPAL" \
  --role="roles/iam.workloadIdentityUser" \
  --project="$PROJECT_ID" >/dev/null

if [[ "${SKIP_BUDGET:-}" != "1" ]]; then
  say "A £25 monthly budget is created only when CONFIRM_BUDGET=25."
  if [[ "${CONFIRM_BUDGET:-}" == "25" ]]; then
    existing="$(gcloud billing budgets list --billing-account="$BILLING_ID" --format='value(displayName)' || true)"
    if printf '%s\n' "$existing" | grep -qx "the-ordinary-512212 monthly"; then
      say "Budget exists: the-ordinary-512212 monthly"
    else
      gcloud billing budgets create \
        --billing-account="$BILLING_ID" \
        --display-name="the-ordinary-512212 monthly" \
        --budget-amount=25GBP \
        --filter-projects="projects/${PROJECT_ID}" \
        --threshold-rule=percent=0.5 \
        --threshold-rule=percent=0.9 \
        --threshold-rule=percent=1.0 || say "Budget create failed. Create the £25 budget in the console if the CLI flags differ."
    fi
  fi
fi

POOL_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/github"
cat >"$OUT" <<EOF
GCP_PROJECT_ID=${PROJECT_ID}
GCP_PROJECT_NUMBER=${PROJECT_NUMBER}
GCP_SERVICE_ACCOUNT_EMAIL=${WRITER}
GCP_WORKLOAD_IDENTITY_POOL_ID=vercel
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel
BQ_LOCATION=${LOCATION}
GCP_WIF_PROVIDER=${POOL_PROVIDER}
GCP_DATAFORM_SA=${DATAFORM}
VERCEL_TEAM_SLUG=${VERCEL_TEAM_SLUG}
EOF
say "Wrote $OUT"
say "Vercel production env: GCP_PROJECT_ID GCP_PROJECT_NUMBER GCP_SERVICE_ACCOUNT_EMAIL GCP_WORKLOAD_IDENTITY_POOL_ID GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID BQ_LOCATION MEMBER_KEY_SECRET CRON_SECRET EXPERIMENT_SALT"
say "GitHub Actions variables: GCP_WIF_PROVIDER GCP_DATAFORM_SA"
say "Generate secrets locally (do not commit): openssl rand -hex 32"
say "If the Vercel CLI is signed in: vercel env add MEMBER_KEY_SECRET production"
