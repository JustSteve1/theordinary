"""Build a 100-row sample for each raw WHOOP and Bee table."""

from __future__ import annotations

import pandas as pd

from ordinary_warehouse.columns import (
    BEE_ACTIVITY_COLUMNS,
    BEE_DAILY_COLUMNS,
    WHOOP_COLUMNS,
    clean_sample,
)


def sample_whoop_and_bee(
    whoop_cycle: pd.DataFrame,
    whoop_recovery: pd.DataFrame,
    whoop_sleep: pd.DataFrame,
    whoop_workout: pd.DataFrame,
    bee_activity: pd.DataFrame,
    bee_daily: pd.DataFrame,
) -> dict[str, pd.DataFrame]:
    frames = {
        "whoop_cycle_sample": clean_sample(whoop_cycle, WHOOP_COLUMNS),
        "whoop_recovery_sample": clean_sample(whoop_recovery, WHOOP_COLUMNS),
        "whoop_sleep_sample": clean_sample(whoop_sleep, WHOOP_COLUMNS),
        "whoop_workout_sample": clean_sample(whoop_workout, WHOOP_COLUMNS),
        "bee_activity_sample": clean_sample(bee_activity, BEE_ACTIVITY_COLUMNS),
        "bee_daily_sample": clean_sample(bee_daily, BEE_DAILY_COLUMNS),
    }
    return frames
