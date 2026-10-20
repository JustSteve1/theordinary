# Ordinary warehouse catalog

Kedro names the data and runs the local test. It does not replace the TypeScript export or Dataform.

`kedro run` uses the `dev` environment. That reads Neon for a status row (consent, WHOOP connected, Bee token present) and writes gitignored parquet. It does not write BigQuery. WHOOP and Bee raw rows are not in Neon, so those local frames stay empty until you sample London.

Landing and sampling London are explicit:

```bash
cd warehouse/kedro
python -m pip install -e .
export MEMBER_KEY_SECRET=...   # the Vercel Production value, at least 32 characters
export DATABASE_URL=...        # Neon
export USER1_EMAIL=...
kedro run --env=prod --pipelines=land_user1
kedro run --env=prod --pipelines=sample_raw
```

`land_user1` impersonates `ordinary-vercel-writer` and calls `scripts/warehouse-land-user1.ts`. `sample_raw` reads at most 100 rows from `ordinary_raw` and drops the payload column. Samples land in `data/08_reporting/`, which is gitignored.

The runbook is `docs/warehouse/RUNBOOK.md`.
