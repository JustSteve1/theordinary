"""Project pipelines.

`kedro run` is the dev catalog: local parquet, no BigQuery writes.
London reads are `kedro run --env=prod --pipelines=sample_raw`.
London writes are `kedro run --env=prod --pipelines=land_user1`.
"""

from __future__ import annotations

from kedro.pipeline import Pipeline

from ordinary_warehouse.pipelines.land_user1.pipeline import create_pipeline as land_pipeline
from ordinary_warehouse.pipelines.sample_raw.pipeline import create_pipeline as sample_pipeline
from ordinary_warehouse.pipelines.snapshot_neon.pipeline import create_pipeline as snapshot_pipeline


def register_pipelines() -> dict[str, Pipeline]:
    sample = sample_pipeline()
    land = land_pipeline()
    snapshot = snapshot_pipeline()
    return {
        "sample_raw": sample,
        "land_user1": land,
        "snapshot_neon": snapshot,
        "__default__": snapshot + sample,
    }
