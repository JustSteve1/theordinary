"""Chronos-2 baseline band: forecast the last WINDOW_DAYS from everything before.

Runs as a Cloud Run job in europe-west2. Reads ordinary_core, ordinary_features
and ordinary_effects; writes ordinary_effects.forecasts with a load job.
Logs show counts only. Never log values or member keys.
"""

from __future__ import annotations

import logging
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from importlib import metadata

import pandas as pd
from google.cloud import bigquery

from bands import (
    MODEL_ID,
    QUANTILE_LEVELS,
    SEGMENT_INSUFFICIENT,
    Context,
    RunInfo,
    Window,
    assert_no_leakage,
    assert_rows_safe,
    build_context,
    build_context_frame,
    build_future_frame,
    forecast_rows,
    insufficient_rows,
    quantile_lookup,
    segment,
    select_windows,
    summarise,
)

LOG = logging.getLogger("forecast")
REQUIRED_LOCATION = "europe-west2"

FORECASTS_SCHEMA = [
    bigquery.SchemaField("run_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("model_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("model_revision", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("package_version", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("experiment_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("member_key", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("feature_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("history_segment", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("history_days", "INT64", mode="REQUIRED"),
    bigquery.SchemaField("filled_days", "INT64", mode="REQUIRED"),
    bigquery.SchemaField("context_start", "DATE"),
    bigquery.SchemaField("context_end", "DATE"),
    bigquery.SchemaField("window_start", "DATE", mode="REQUIRED"),
    bigquery.SchemaField("window_end", "DATE", mode="REQUIRED"),
    bigquery.SchemaField("target_date", "DATE"),
    bigquery.SchemaField("q10", "FLOAT64"),
    bigquery.SchemaField("q50", "FLOAT64"),
    bigquery.SchemaField("q90", "FLOAT64"),
    bigquery.SchemaField("status", "STRING", mode="REQUIRED"),
]


@dataclass(frozen=True)
class Settings:
    project_id: str
    location: str
    experiment_id: str
    window_days: int
    min_full_days: int
    min_limited_days: int
    model_dir: str
    model_revision: str
    fill_gaps: bool

    @property
    def table(self) -> str:
        return f"{self.project_id}.ordinary_effects.forecasts"


def load_settings(env: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ if env is None else env)
    location = env.get("BQ_LOCATION", "")
    if location != REQUIRED_LOCATION:
        raise SystemExit(f"BQ_LOCATION must be {REQUIRED_LOCATION}; refusing to run.")
    settings = Settings(
        project_id=env.get("GCP_PROJECT_ID", "the-ordinary-512212"),
        location=location,
        experiment_id=env.get("EXPERIMENT_ID", "barbara-dry-run"),
        window_days=int(env.get("WINDOW_DAYS", "7")),
        min_full_days=int(env.get("MIN_FULL_DAYS", "14")),
        min_limited_days=int(env.get("MIN_LIMITED_DAYS", "5")),
        model_dir=env.get("MODEL_DIR", "/models/chronos-2"),
        model_revision=env.get("MODEL_REVISION", "unknown"),
        fill_gaps=env.get("FILL_GAPS", "0") == "1",
    )
    if settings.window_days < 1 or settings.min_limited_days < 1 or settings.min_full_days < settings.min_limited_days:
        raise SystemExit("WINDOW_DAYS, MIN_FULL_DAYS and MIN_LIMITED_DAYS are inconsistent.")
    return settings


def client_for(settings: Settings) -> bigquery.Client:
    return bigquery.Client(project=settings.project_id, location=settings.location)


def query(client: bigquery.Client, settings: Settings, sql: str, params: list) -> pd.DataFrame:
    job = client.query(
        sql,
        location=settings.location,
        job_config=bigquery.QueryJobConfig(query_parameters=params),
    )
    return job.result().to_dataframe(create_bqstorage_client=False)


def read_members(client: bigquery.Client, settings: Settings) -> list[str]:
    sql = f"""
      select member_key
      from `{settings.project_id}.ordinary_core.study_enrolments`
      where experiment_id = @experiment_id
      qualify row_number() over (partition by member_key order by version desc) = 1
    """
    frame = query(client, settings, sql, [bigquery.ScalarQueryParameter("experiment_id", "STRING", settings.experiment_id)])
    return sorted(str(key) for key in frame["member_key"].tolist())


def read_frame(client: bigquery.Client, settings: Settings, members: list[str]) -> pd.DataFrame:
    sql = f"""
      with latest as (
        select member_key, max(version) as version
        from `{settings.project_id}.ordinary_core.study_enrolments`
        where experiment_id = @experiment_id and member_key in unnest(@members)
        group by member_key
      )
      select f.member_key, f.date, f.measure_id, f.value_number
      from `{settings.project_id}.ordinary_effects.study_frame_long` f
      join latest using (member_key, version)
      where f.experiment_id = @experiment_id and f.source = 'ordinary'
    """
    frame = query(
        client,
        settings,
        sql,
        [
            bigquery.ScalarQueryParameter("experiment_id", "STRING", settings.experiment_id),
            bigquery.ArrayQueryParameter("members", "STRING", members),
        ],
    )
    frame["date"] = pd.to_datetime(frame["date"])
    frame["value_number"] = pd.to_numeric(frame["value_number"], errors="coerce")
    return frame


def read_features(
    client: bigquery.Client,
    settings: Settings,
    members: list[str],
    features: list[str],
    before: date,
) -> pd.DataFrame:
    sql = f"""
      select member_key, date, feature_id, value
      from `{settings.project_id}.ordinary_features.features_daily`
      where member_key in unnest(@members)
        and feature_id in unnest(@features)
        and date < @before
      qualify row_number() over (
        partition by member_key, date, feature_id
        order by feature_version desc, computed_at desc
      ) = 1
    """
    frame = query(
        client,
        settings,
        sql,
        [
            bigquery.ArrayQueryParameter("members", "STRING", members),
            bigquery.ArrayQueryParameter("features", "STRING", features),
            bigquery.ScalarQueryParameter("before", "DATE", before),
        ],
    )
    frame["date"] = pd.to_datetime(frame["date"])
    frame["value"] = pd.to_numeric(frame["value"], errors="coerce")
    return frame


def predict(context_df: pd.DataFrame, future_df: pd.DataFrame, settings: Settings) -> pd.DataFrame:
    """The only function that imports torch and chronos."""
    import torch
    from chronos import Chronos2Pipeline

    torch.set_num_threads(max(1, os.cpu_count() or 1))
    pipeline = Chronos2Pipeline.from_pretrained(settings.model_dir, device_map="cpu")
    return pipeline.predict_df(
        context_df,
        future_df=future_df,
        id_column="id",
        timestamp_column="timestamp",
        target="target",
        prediction_length=settings.window_days,
        quantile_levels=list(QUANTILE_LEVELS),
        freq="D",
    )


def package_version() -> str:
    try:
        return metadata.version("chronos-forecasting")
    except metadata.PackageNotFoundError:
        return "unknown"


def write_rows(client: bigquery.Client, settings: Settings, rows: list[dict]) -> None:
    job_config = bigquery.LoadJobConfig(
        schema=FORECASTS_SCHEMA,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        create_disposition=bigquery.CreateDisposition.CREATE_IF_NEEDED,
    )
    job = client.load_table_from_json(rows, settings.table, location=settings.location, job_config=job_config)
    job.result()


def run(settings: Settings, client: bigquery.Client) -> list[dict]:
    members = read_members(client, settings)
    LOG.info("members enrolled: %d", len(members))
    if not members:
        return []

    frame = read_frame(client, settings, members)
    windows = {w.member_key: w for w in select_windows(frame, settings.window_days)}
    measures = sorted(str(m) for m in frame["measure_id"].dropna().unique().tolist())
    LOG.info("members with a window: %d, measures: %d", len(windows), len(measures))
    if not windows or not measures:
        return []

    latest_window_start = max(w.window_start for w in windows.values())
    features = read_features(client, settings, sorted(windows), measures, latest_window_start)

    run_info = RunInfo(
        run_id=str(uuid.uuid4()),
        created_at=datetime.now(timezone.utc).isoformat(),
        model_revision=settings.model_revision,
        package_version=package_version(),
        experiment_id=settings.experiment_id,
    )

    rows: list[dict] = []
    to_predict: list[tuple[Context, Window, str]] = []
    for member_key, window in sorted(windows.items()):
        for feature_id in measures:
            history = features[(features["member_key"] == member_key) & (features["feature_id"] == feature_id)]
            context = build_context(
                history[["date", "value"]],
                member_key,
                feature_id,
                window.window_start,
                fill_gaps=settings.fill_gaps,
            )
            history_days = context.history_days if context else 0
            history_segment = segment(history_days, settings.min_full_days, settings.min_limited_days)
            if context is None or history_segment == SEGMENT_INSUFFICIENT:
                rows.extend(insufficient_rows(run_info, member_key, feature_id, window, context))
                continue
            to_predict.append((context, window, history_segment))

    if to_predict:
        contexts = [item[0] for item in to_predict]
        assert_no_leakage(contexts, windows)
        LOG.info("series to forecast: %d", len(contexts))
        predictions = predict(build_context_frame(contexts), build_future_frame(contexts, windows), settings)
        lookup = quantile_lookup(predictions)
        for context, window, history_segment in to_predict:
            rows.extend(forecast_rows(run_info, context, window, history_segment, lookup))

    assert_rows_safe(rows)
    return rows


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stdout)
    settings = load_settings()
    LOG.info("model %s revision %s, window %d days", MODEL_ID, settings.model_revision[:7], settings.window_days)
    client = client_for(settings)
    rows = run(settings, client)
    if not rows:
        LOG.info("nothing to write")
        return 0
    write_rows(client, settings, rows)
    LOG.info("wrote %d rows: %s", len(rows), summarise(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
