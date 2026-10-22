"""pytest for bands.py. No network, no torch."""

from datetime import date, timedelta

import pandas as pd
import pytest

import bands
from bands import (
    BANNED_KEYS,
    OUTPUT_COLUMNS,
    LeakageError,
    RunInfo,
    SpeechKeyError,
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

RUN = RunInfo(
    run_id="run-1",
    created_at="2026-10-22T09:00:00+00:00",
    model_revision="29ec3766d36d6f73f0696f85560a422f50e8498c",
    package_version="2.3.2",
    experiment_id="barbara-dry-run",
)
WINDOW = Window(member_key="abc", window_start=date(2026, 10, 15), window_end=date(2026, 10, 21))


def history(start: date, values: list):
    return pd.DataFrame(
        {"date": [start + timedelta(days=i) for i in range(len(values))], "value": values}
    )


@pytest.mark.parametrize(
    "days, expected",
    [(0, "insufficient"), (4, "insufficient"), (5, "limited"), (13, "limited"), (14, "full"), (40, "full")],
)
def test_segment_thresholds(days, expected):
    assert segment(days, min_full=14, min_limited=5) == expected


def test_window_uses_latest_non_null_date_across_measures():
    frame = pd.DataFrame(
        {
            "member_key": ["abc"] * 4 + ["def"],
            "date": ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-10"],
            "measure_id": ["whoop.hrv_rmssd_ms", "recall.accuracy", "whoop.hrv_rmssd_ms", "recall.accuracy", "x"],
            "value_number": [40.0, None, 41.0, None, None],
        }
    )
    windows = {w.member_key: w for w in select_windows(frame, 7)}
    assert set(windows) == {"abc"}
    assert windows["abc"].window_end == date(2026, 10, 21)
    assert windows["abc"].window_start == date(2026, 10, 15)
    assert len(windows["abc"].dates) == 7


def test_select_windows_empty_frame():
    assert select_windows(pd.DataFrame(columns=["member_key", "date", "value_number"]), 7) == []


def test_context_drops_window_rows_and_counts_non_null_days():
    rows = history(date(2026, 10, 1), [1.0, 2.0, None, 4.0, 5.0] + [6.0] * 20)
    context = build_context(rows, "abc", "whoop.hrv_rmssd_ms", WINDOW.window_start)
    assert context is not None
    assert context.context_start == date(2026, 10, 1)
    assert context.context_end == date(2026, 10, 14)
    assert len(context.values) == 14
    assert context.history_days == 13
    assert context.filled_days == 0
    assert pd.isna(context.values.iloc[2])
    assert context.series_id == "abc|whoop.hrv_rmssd_ms"


def test_context_keeps_trailing_gap_so_horizon_starts_at_window():
    rows = history(date(2026, 10, 1), [1.0] * 10)
    context = build_context(rows, "abc", "f", WINDOW.window_start)
    assert context is not None
    assert context.context_end == date(2026, 10, 14)
    assert context.history_days == 10
    assert context.values.tail(4).isna().all()


def test_context_none_without_history():
    assert build_context(pd.DataFrame(columns=["date", "value"]), "abc", "f", WINDOW.window_start) is None
    only_window = history(WINDOW.window_start, [1.0, 2.0])
    assert build_context(only_window, "abc", "f", WINDOW.window_start) is None


def test_gap_filling_interpolates_interior_and_records_filled_days():
    rows = history(date(2026, 10, 1), [2.0, None, None, 8.0, None, 10.0])
    context = build_context(rows, "abc", "f", WINDOW.window_start, fill_gaps=True)
    assert context is not None
    assert context.filled_days == 3
    assert context.history_days == 3
    assert context.values.iloc[1] == pytest.approx(4.0)
    assert context.values.iloc[2] == pytest.approx(6.0)
    assert context.values.iloc[4] == pytest.approx(9.0)
    # trailing gap up to window_start - 1 stays missing
    assert context.values.tail(8).isna().all()


def test_leakage_guard_raises_for_context_inside_window():
    rows = history(date(2026, 10, 1), [1.0] * 20)
    context = build_context(rows, "abc", "f", WINDOW.window_start)
    assert context is not None
    assert_no_leakage([context], {"abc": WINDOW})
    leaked = pd.Series([1.0] * 16, index=pd.date_range("2026-10-01", periods=16, freq="D"))
    bad = bands.Context(series_id="abc|f", member_key="abc", feature_id="f", values=leaked, history_days=16, filled_days=0)
    with pytest.raises(LeakageError):
        assert_no_leakage([bad], {"abc": WINDOW})


def test_context_and_future_frames_carry_day_of_week():
    context = build_context(history(date(2026, 10, 1), [1.0] * 14), "abc", "f", WINDOW.window_start)
    assert context is not None
    ctx = build_context_frame([context])
    fut = build_future_frame([context], {"abc": WINDOW})
    assert list(ctx.columns) == ["id", "timestamp", "target", "day_of_week"]
    assert list(fut.columns) == ["id", "timestamp", "day_of_week"]
    assert len(fut) == 7
    assert fut["timestamp"].min() == pd.Timestamp(WINDOW.window_start)
    assert fut["timestamp"].max() == pd.Timestamp(WINDOW.window_end)
    assert ctx["timestamp"].max() + pd.Timedelta(days=1) == fut["timestamp"].min()
    assert set(ctx["day_of_week"]) <= set(range(7))
    assert fut["day_of_week"].tolist() == [d.weekday() for d in WINDOW.dates]


def test_forecast_rows_and_no_banned_keys():
    context = build_context(history(date(2026, 9, 1), [50.0] * 40), "abc", "whoop.hrv_rmssd_ms", WINDOW.window_start)
    assert context is not None
    predictions = pd.DataFrame(
        {
            "id": ["abc|whoop.hrv_rmssd_ms"] * 7,
            "timestamp": pd.date_range(WINDOW.window_start, periods=7, freq="D"),
            "target_name": ["target"] * 7,
            "predictions": [50.0] * 7,
            "0.1": [45.0] * 7,
            "0.5": [50.0] * 7,
            "0.9": [55.0] * 7,
        }
    )
    lookup = quantile_lookup(predictions)
    rows = forecast_rows(RUN, context, WINDOW, "full", lookup)
    rows += insufficient_rows(RUN, "abc", "recall.accuracy", WINDOW, None)
    assert len(rows) == 8
    assert all(set(row) == set(OUTPUT_COLUMNS) for row in rows)
    assert rows[0]["q10"] == 45.0 and rows[0]["q90"] == 55.0 and rows[0]["status"] == "ok"
    assert rows[0]["target_date"] == "2026-10-15" and rows[6]["target_date"] == "2026-10-21"
    assert rows[0]["context_end"] == "2026-10-14"
    assert rows[-1]["status"] == "insufficient_history"
    assert rows[-1]["q50"] is None and rows[-1]["target_date"] is None
    assert_rows_safe(rows)
    assert not any(key in BANNED_KEYS or key.endswith("_text") for row in rows for key in row)
    assert summarise(rows) == {"full/ok": 7, "insufficient/insufficient_history": 1}


def test_missing_prediction_becomes_error_row():
    context = build_context(history(date(2026, 9, 1), [50.0] * 40), "abc", "f", WINDOW.window_start)
    assert context is not None
    rows = forecast_rows(RUN, context, WINDOW, "full", {})
    assert {row["status"] for row in rows} == {"error"}


def test_quantile_lookup_requires_chronos_columns():
    with pytest.raises(KeyError):
        quantile_lookup(pd.DataFrame({"id": [], "timestamp": [], "0.5": []}))


def test_assert_rows_safe_rejects_speech_keys():
    with pytest.raises(SpeechKeyError):
        assert_rows_safe([{"run_id": "x", "summary": "speech"}])
    with pytest.raises(SpeechKeyError):
        assert_rows_safe([{"run_id": "x", "talk_text": "speech"}])
    with pytest.raises(SpeechKeyError):
        assert_rows_safe([{"run_id": "x", "email": "a@b.c"}])


def test_banned_keys_match_firewall():
    import pathlib
    import re

    firewall = pathlib.Path(__file__).resolve().parents[2] / "src" / "platform" / "warehouse" / "firewall.ts"
    source = firewall.read_text()
    block = source[source.index("new Set([") : source.index("]);")]
    keys = set(re.findall(r'"([^"]+)"', block))
    assert keys == set(BANNED_KEYS)
