"""Column lists shared by the local sample. Speech keys match the TypeScript firewall."""

from __future__ import annotations

import pandas as pd

BANNED = {
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
}

WHOOP_COLUMNS = [
    "member_key",
    "record_id",
    "record_updated_at",
    "start_at",
    "end_at",
    "timezone_offset",
    "score_state",
    "deleted",
    "source",
    "ingested_at",
]

BEE_ACTIVITY_COLUMNS = [
    "member_key",
    "item_id",
    "kind",
    "start_at",
    "end_at",
    "duration_s",
    "is_ordinary_echo",
    "ingested_at",
]

BEE_DAILY_COLUMNS = [
    "member_key",
    "day",
    "has_daily_summary",
    "ingested_at",
]

SAMPLE_LIMIT = 100
MAX_STRING = 200


def empty_frame(columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(columns=columns)


def is_banned(name: str) -> bool:
    return name == "payload" or name in BANNED or name.endswith("_text")


def clean_sample(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """Keep the warehouse columns, drop speech, and cap the sample at 100 rows."""
    data = frame.copy() if frame is not None else empty_frame(columns)
    drop = [name for name in data.columns if is_banned(str(name))]
    if drop:
        data = data.drop(columns=drop)
    for name in data.columns:
        series = data[name]
        if pd.api.types.is_string_dtype(series) or series.dtype == object:
            data[name] = series.map(_shorten)
    keep = [name for name in columns if name in data.columns]
    extra = [name for name in data.columns if name not in keep and not is_banned(str(name))]
    ordered = keep + extra
    return data.loc[:, ordered].head(SAMPLE_LIMIT).reset_index(drop=True)


def _shorten(value: object) -> object:
    if isinstance(value, str) and len(value) > MAX_STRING:
        return None
    return value
