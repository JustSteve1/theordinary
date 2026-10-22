"""Pure pandas logic for the Chronos-2 baseline band.

No model import, no network. `forecast.py` owns BigQuery and Chronos-2.
Mirrors the speech-key list in `src/platform/warehouse/firewall.ts`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable, Mapping

import pandas as pd

# Keep in step with BANNED in src/platform/warehouse/firewall.ts.
BANNED_KEYS = frozenset(
    {
        "talk_text",
        "narrative",
        "transcript",
        "summary",
        "short_summary",
        "detail",
        "text",
        "question",
        "answer",
        "answers",
        "clauses",
        "evidence",
        "body",
        "message",
        "content",
        "notes",
        "facts",
        "instruction",
        "hypothesis",
        "study_id",
    }
)

SEGMENT_FULL = "full"
SEGMENT_LIMITED = "limited"
SEGMENT_INSUFFICIENT = "insufficient"

STATUS_OK = "ok"
STATUS_INSUFFICIENT = "insufficient_history"
STATUS_ERROR = "error"

MODEL_ID = "amazon/chronos-2"
QUANTILE_LEVELS = (0.1, 0.5, 0.9)
ID_SEPARATOR = "|"

OUTPUT_COLUMNS = (
    "run_id",
    "created_at",
    "model_id",
    "model_revision",
    "package_version",
    "experiment_id",
    "member_key",
    "feature_id",
    "history_segment",
    "history_days",
    "filled_days",
    "context_start",
    "context_end",
    "window_start",
    "window_end",
    "target_date",
    "q10",
    "q50",
    "q90",
    "status",
)


class LeakageError(RuntimeError):
    """A context contains a date on or after the forecast window."""


class SpeechKeyError(RuntimeError):
    """A row carries a key the warehouse firewall bans."""


@dataclass(frozen=True)
class Window:
    member_key: str
    window_start: date
    window_end: date

    @property
    def dates(self) -> list[date]:
        days = (self.window_end - self.window_start).days + 1
        return [self.window_start + timedelta(days=i) for i in range(days)]


@dataclass
class Context:
    series_id: str
    member_key: str
    feature_id: str
    values: pd.Series  # daily index, NaN for missing days
    history_days: int
    filled_days: int

    @property
    def context_start(self) -> date:
        return self.values.index[0].date()

    @property
    def context_end(self) -> date:
        return self.values.index[-1].date()


def series_id(member_key: str, feature_id: str) -> str:
    return f"{member_key}{ID_SEPARATOR}{feature_id}"


def split_series_id(value: str) -> tuple[str, str]:
    member_key, _, feature_id = value.partition(ID_SEPARATOR)
    return member_key, feature_id


def segment(history_days: int, min_full: int = 14, min_limited: int = 5) -> str:
    if history_days >= min_full:
        return SEGMENT_FULL
    if history_days >= min_limited:
        return SEGMENT_LIMITED
    return SEGMENT_INSUFFICIENT


def select_windows(frame: pd.DataFrame, window_days: int) -> list[Window]:
    """One window per member from the study frame.

    `frame` has columns member_key, date, value_number. `window_end` is the
    latest date with any non-null daily value; all measures share the window.
    Members with no values are skipped.
    """
    if window_days < 1:
        raise ValueError("window_days must be at least 1")
    if frame.empty:
        return []
    present = frame.dropna(subset=["value_number"])
    windows: list[Window] = []
    for member_key, group in present.groupby("member_key", sort=True):
        end = pd.to_datetime(group["date"]).max().date()
        start = end - timedelta(days=window_days - 1)
        windows.append(Window(member_key=str(member_key), window_start=start, window_end=end))
    return windows


def build_context(
    history: pd.DataFrame,
    member_key: str,
    feature_id: str,
    window_start: date,
    fill_gaps: bool = False,
) -> Context | None:
    """Daily context from the first non-null day to `window_start - 1`.

    `history` has columns date, value. Rows on or after `window_start` are
    dropped. Interior and trailing gaps stay NaN unless `fill_gaps`, which
    linearly interpolates interior gaps only and records `filled_days`.
    Returns None when there is no history before the window.
    """
    if history.empty:
        return None
    dates = pd.to_datetime(history["date"])
    values = pd.to_numeric(history["value"], errors="coerce")
    before = pd.Series(values.to_numpy(), index=dates).sort_index()
    before = before[before.index < pd.Timestamp(window_start)]
    before = before.dropna()
    if before.empty:
        return None
    before = before.groupby(level=0).last()
    index = pd.date_range(before.index.min(), pd.Timestamp(window_start) - pd.Timedelta(days=1), freq="D")
    daily = before.reindex(index).astype("float64")
    history_days = int(daily.notna().sum())
    filled_days = 0
    if fill_gaps:
        last_observed = daily.last_valid_index()
        interior = daily.loc[:last_observed]
        filled = interior.interpolate(method="linear", limit_area="inside")
        filled_days = int(filled.notna().sum() - interior.notna().sum())
        daily.loc[:last_observed] = filled
    return Context(
        series_id=series_id(member_key, feature_id),
        member_key=member_key,
        feature_id=feature_id,
        values=daily,
        history_days=history_days,
        filled_days=filled_days,
    )


def assert_no_leakage(contexts: Iterable[Context], windows: Mapping[str, Window]) -> None:
    for context in contexts:
        window = windows[context.member_key]
        if context.context_end >= window.window_start:
            raise LeakageError(
                f"series {context.feature_id} context ends on or after the window start"
            )


def day_of_week(index: pd.DatetimeIndex) -> pd.Series:
    return pd.Series(index.dayofweek.astype("int64"), index=index)


def build_context_frame(contexts: Iterable[Context]) -> pd.DataFrame:
    parts = []
    for context in contexts:
        parts.append(
            pd.DataFrame(
                {
                    "id": context.series_id,
                    "timestamp": context.values.index,
                    "target": context.values.to_numpy(),
                    "day_of_week": context.values.index.dayofweek.astype("int64"),
                }
            )
        )
    if not parts:
        return pd.DataFrame(columns=["id", "timestamp", "target", "day_of_week"])
    return pd.concat(parts, ignore_index=True)


def build_future_frame(contexts: Iterable[Context], windows: Mapping[str, Window]) -> pd.DataFrame:
    parts = []
    for context in contexts:
        window = windows[context.member_key]
        index = pd.DatetimeIndex([pd.Timestamp(d) for d in window.dates])
        parts.append(
            pd.DataFrame(
                {
                    "id": context.series_id,
                    "timestamp": index,
                    "day_of_week": index.dayofweek.astype("int64"),
                }
            )
        )
    if not parts:
        return pd.DataFrame(columns=["id", "timestamp", "day_of_week"])
    return pd.concat(parts, ignore_index=True)


def quantile_lookup(predictions: pd.DataFrame) -> dict[tuple[str, date], tuple[float, float, float]]:
    """Map (series id, target date) to (q10, q50, q90) from a predict_df result.

    Chronos-2 names quantile columns by level: "0.1", "0.5", "0.9".
    """
    required = {"id", "timestamp", *(str(q) for q in QUANTILE_LEVELS)}
    missing = required - set(predictions.columns)
    if missing:
        raise KeyError(f"prediction frame is missing columns: {sorted(missing)}")
    lookup: dict[tuple[str, date], tuple[float, float, float]] = {}
    ids = predictions["id"].astype(str).tolist()
    stamps = pd.to_datetime(predictions["timestamp"]).tolist()
    columns = [predictions[str(q)].astype("float64").tolist() for q in QUANTILE_LEVELS]
    for index, (item, stamp) in enumerate(zip(ids, stamps)):
        lookup[(item, stamp.date())] = (columns[0][index], columns[1][index], columns[2][index])
    return lookup


@dataclass(frozen=True)
class RunInfo:
    run_id: str
    created_at: str
    model_revision: str
    package_version: str
    experiment_id: str
    model_id: str = MODEL_ID


def _base_row(run: RunInfo, member_key: str, feature_id: str, window: Window) -> dict:
    return {
        "run_id": run.run_id,
        "created_at": run.created_at,
        "model_id": run.model_id,
        "model_revision": run.model_revision,
        "package_version": run.package_version,
        "experiment_id": run.experiment_id,
        "member_key": member_key,
        "feature_id": feature_id,
        "window_start": window.window_start.isoformat(),
        "window_end": window.window_end.isoformat(),
    }


def insufficient_rows(
    run: RunInfo,
    member_key: str,
    feature_id: str,
    window: Window,
    context: Context | None,
) -> list[dict]:
    row = _base_row(run, member_key, feature_id, window)
    row.update(
        {
            "history_segment": SEGMENT_INSUFFICIENT,
            "history_days": context.history_days if context else 0,
            "filled_days": context.filled_days if context else 0,
            "context_start": context.context_start.isoformat() if context else None,
            "context_end": context.context_end.isoformat() if context else None,
            "target_date": None,
            "q10": None,
            "q50": None,
            "q90": None,
            "status": STATUS_INSUFFICIENT,
        }
    )
    return [row]


def forecast_rows(
    run: RunInfo,
    context: Context,
    window: Window,
    history_segment: str,
    lookup: Mapping[tuple[str, date], tuple[float, float, float]],
) -> list[dict]:
    rows = []
    for target_date in window.dates:
        quantiles = lookup.get((context.series_id, target_date))
        row = _base_row(run, context.member_key, context.feature_id, window)
        row.update(
            {
                "history_segment": history_segment,
                "history_days": context.history_days,
                "filled_days": context.filled_days,
                "context_start": context.context_start.isoformat(),
                "context_end": context.context_end.isoformat(),
                "target_date": target_date.isoformat(),
            }
        )
        if quantiles is None or any(pd.isna(q) for q in quantiles):
            row.update({"q10": None, "q50": None, "q90": None, "status": STATUS_ERROR})
        else:
            q10, q50, q90 = quantiles
            row.update({"q10": q10, "q50": q50, "q90": q90, "status": STATUS_OK})
        rows.append(row)
    return rows


def assert_rows_safe(rows: Iterable[Mapping]) -> None:
    for index, row in enumerate(rows):
        for key in row:
            if key in BANNED_KEYS or key.endswith("_text"):
                raise SpeechKeyError(f"row {index} carries banned key {key!r}")
        extra = set(row) - set(OUTPUT_COLUMNS)
        if extra:
            raise SpeechKeyError(f"row {index} carries unexpected keys {sorted(extra)}")


def summarise(rows: Iterable[Mapping]) -> dict[str, int]:
    """Counts per segment and status. Safe to log: no values or keys."""
    counts: dict[str, int] = {}
    for row in rows:
        label = f"{row['history_segment']}/{row['status']}"
        counts[label] = counts.get(label, 0) + 1
    return dict(sorted(counts.items()))
