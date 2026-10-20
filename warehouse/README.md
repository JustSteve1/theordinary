# Warehouse bootstrap

`bootstrap.sh` configures the existing Google Cloud project `the-ordinary-512212` in `europe-west2`. It does not create the project and it never creates service-account keys.

## What it creates

- Enabled APIs: BigQuery, BigQuery Storage, Data Transfer, IAM, IAM Credentials, STS, Resource Manager, Logging, Billing Budgets.
- Datasets: `ordinary_raw`, `ordinary_core`, `ordinary_features`, `ordinary_experiments`, `ordinary_effects`, `ordinary_effects_test`. Only the test dataset has a 30-day default table expiration.
- Service accounts: `ordinary-vercel-writer` (raw + experiments editor, job user) and `ordinary-dataform` (raw/experiments viewer, derived datasets editor, job user).
- Workload Identity pools `vercel` and `github`. Production Vercel writes only. GitHub Actions may impersonate the Dataform account for `JustSteve1/theordinary`.
- A £25 monthly budget, only when you re-run with `CONFIRM_BUDGET=25`.

## Re-run

```bash
gcloud auth login
gcloud auth application-default login
export VERCEL_TEAM_SLUG="steves-projects-af4cd3c7"
# Project URL: https://vercel.com/steves-projects-af4cd3c7/theordinary
# OIDC Federation must be in Team issuer mode.
bash warehouse/bootstrap.sh
CONFIRM_BUDGET=25 bash warehouse/bootstrap.sh
```

The script skips resources that already exist. Output values go to `warehouse/bootstrap.out.env`, which is gitignored.

Secrets (`MEMBER_KEY_SECRET`, `CRON_SECRET`, `EXPERIMENT_SALT`) are generated locally with `openssl rand -hex 32` and added to Vercel Production. They are not written by this script.

## Undo

- Datasets: `bq rm -r -f -d the-ordinary-512212:ordinary_raw` (repeat per dataset). This deletes analysis data.
- Service accounts: `gcloud iam service-accounts delete ordinary-vercel-writer@the-ordinary-512212.iam.gserviceaccount.com`
- Pools: `gcloud iam workload-identity-pools delete vercel --location=global`
- Budget: delete it in Cloud Billing. The script does not store the budget ID.
- IAM bindings: remove the same `--member` and `--role` with `remove-iam-policy-binding`.
