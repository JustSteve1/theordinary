# Chronos-2 baseline band

A Cloud Run job in `europe-west2` that forecasts the last 7 days of each daily measure from every day before, so `/demo` can draw a grey "what we expected" band under the actual line.

## What it does

1. Reads the members enrolled in `EXPERIMENT_ID` from `ordinary_core.study_enrolments` (latest version).
2. Picks one window per member: `window_end` is the latest date with any non-null daily value in `ordinary_effects.study_frame_long` (`source = 'ordinary'`), `window_start = window_end − (WINDOW_DAYS − 1)`. All measures share the window.
3. For each member and measure, takes all `ordinary_features.features_daily` rows (latest `feature_version`) with `date < window_start`, on a complete daily index from the first non-null day to `window_start − 1`. Missing days stay missing: Chronos-2 accepts NaN in the context. Set `FILL_GAPS=1` to interpolate interior gaps instead; `filled_days` records how many.
4. Segments by the number of non-null history days: 14 or more is `full`, 5 to 13 is `limited`, fewer is `insufficient` (written with null quantiles, not forecast).
5. Asserts that every context ends before its window, then runs one batched `Chronos2Pipeline.predict_df` on CPU with `day_of_week` as a known covariate and quantiles 0.1, 0.5, 0.9.
6. Writes `ordinary_effects.forecasts` with a load job (`WRITE_TRUNCATE`), one row per member, feature and target date.

Logs show counts per segment and status only. Values and member keys are never logged.

## What it does not do

- No nightly schedule. Run it by hand before the demo.
- No rolling day-by-day forecasts, no backtests, no placebo gates.
- No change to the estimator or effect tables. `forecasts` is a Dataform source, never rebuilt by Dataform.
- No speech, no identity. Only `member_key`, feature ids, dates and quantiles.
- No network calls except BigQuery. The model is baked into the image and `HF_HUB_OFFLINE=1`.

## Files

| File | Purpose |
| --- | --- |
| `bands.py` | Windowing, segmenting, leakage guard, row building. pandas only. |
| `forecast.py` | Settings, BigQuery reads and the load job. The Chronos-2 import lives in `predict()` alone. |
| `test_bands.py` | pytest, no torch, no network. Runs in CI. |
| `Dockerfile` | `python:3.11-slim`, CPU-only torch, pinned `chronos-forecasting` 2.x, model snapshot at a pinned revision. |
| `setup.sh` | Idempotent London setup: APIs, `ordinary-forecaster` service account, dataset access, Cloud Run job deploy, and `run.invoker` on the job for `ordinary-dataform` so the Warehouse workflow can execute it. |

## Settings

| Variable | Default | Notes |
| --- | --- | --- |
| `GCP_PROJECT_ID` | `the-ordinary-512212` | |
| `BQ_LOCATION` | `europe-west2` | The job refuses to run with any other value. |
| `EXPERIMENT_ID` | `barbara-dry-run` | |
| `WINDOW_DAYS` | `7` | |
| `MIN_FULL_DAYS` | `14` | |
| `MIN_LIMITED_DAYS` | `5` | |
| `MODEL_DIR` | `/models/chronos-2` | |
| `MODEL_REVISION` | set at build time | Commit SHA of `amazon/chronos-2`, pinned in the Dockerfile. |
| `FILL_GAPS` | `0` | `1` interpolates interior gaps. |

## Deploy and run

Needs `gcloud` signed in as a project owner. No service-account keys are created.

```bash
warehouse/forecast/setup.sh            # or: warehouse/bootstrap.sh --with-forecast
pnpm forecast:run                      # gcloud run jobs execute ordinary-forecast --region europe-west2 --wait
npx @dataform/cli@3.1.0 run --project-dir warehouse/dataform --tags forecast   # leakage assertion
pnpm demo:snapshot barbara-dry-run     # picks up the latest run_id
```

Check the result:

```sql
select feature_id, history_segment, status, count(*) as rows
from `the-ordinary-512212.ordinary_effects.forecasts`
group by 1, 2, 3
order by 1, 2, 3;
```

To bump the model, look up the current commit once (`HfApi().model_info("amazon/chronos-2").sha`), change `ARG MODEL_REVISION` in the Dockerfile and redeploy.

## Tests

```bash
pip install pandas pytest
pytest warehouse/forecast
```

## Cost

A few CPU minutes per run on 2 vCPU / 4 GiB, plus about 2 GB of Artifact Registry storage for the image. Nothing runs when the job is idle.

## Remove

```bash
gcloud run jobs delete ordinary-forecast --region europe-west2
gcloud artifacts repositories delete cloud-run-source-deploy --location europe-west2
gcloud iam service-accounts delete ordinary-forecaster@the-ordinary-512212.iam.gserviceaccount.com
bq rm -f the-ordinary-512212:ordinary_effects.forecasts
```

Then drop the `forecasts` declaration and `forecast_no_leakage` assertion from `warehouse/dataform`. Snapshots without `forecast_bands` still load; `/demo` simply draws no band.
