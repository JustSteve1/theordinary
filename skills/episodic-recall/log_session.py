#!/usr/bin/env python3
"""Write the episodic-recall session record.

This is the CI-5 step. After a check-in is scored, the skill sends one record
into the member database for future days: when it happened, which day and
window it covers, the recall scores, confounders, and the trend against that
person's own baseline.

The record never contains the transcript, the answer key, or anyone else's
words. Those stay out of the log on purpose. The dashboard and the next
baseline read this record only.

Usage: python3 skills/episodic-recall/log_session.py < session.json
"""

from __future__ import annotations

import json
import math
import sys
import uuid

MIN_BASELINE = 5
Z_ABOVE = 1.5
Z_BELOW = -1.5

FLAGS = {
    "insufficient_baseline",
    "within_range",
    "above_range",
    "below_range",
    "review_suggested",
}

FORBIDDEN = {
    "narrative",
    "transcript",
    "answer",
    "answers",
    "question",
    "questions",
    "terms",
    "term",
    "speech",
    "words",
    "summary",
    "fact",
    "facts",
    "todo",
    "todos",
    "email",
    "prompt",
    "utterance",
    "dialogue",
}


class Refusal(Exception):
    pass


def js_round(value: float) -> float:
    return math.floor(value * 100 + 0.5) / 100


def refuse_words(value: object) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in FORBIDDEN:
                raise Refusal()
            refuse_words(item)
    elif isinstance(value, list):
        for item in value:
            refuse_words(item)


def number_or_null(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise Refusal()
    if not math.isfinite(value):
        raise Refusal()
    return float(value)


def flag(value: object) -> str:
    if value not in FLAGS:
        raise Refusal()
    return str(value)


def confounders(value: object) -> dict[str, bool]:
    if not isinstance(value, dict):
        raise Refusal()
    poor = value.get("poor_sleep")
    unwell = value.get("unwell_or_alcohol")
    if not isinstance(poor, bool) or not isinstance(unwell, bool):
        raise Refusal()
    return {"poor_sleep": poor, "unwell_or_alcohol": unwell}


def trend_block(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise Refusal()
    n_prior = value.get("n_prior")
    n_prior_clean = value.get("n_prior_clean")
    if (
        isinstance(n_prior, bool)
        or isinstance(n_prior_clean, bool)
        or not isinstance(n_prior, int)
        or not isinstance(n_prior_clean, int)
    ):
        raise Refusal()
    return {
        "n_prior": n_prior,
        "n_prior_clean": n_prior_clean,
        "baseline_mean": number_or_null(value.get("baseline_mean")),
        "baseline_sd": number_or_null(value.get("baseline_sd")),
        "z": number_or_null(value.get("z")),
        "flag": flag(value.get("flag")),
    }


def prior_session(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise Refusal()
    aborted = value.get("aborted")
    if not isinstance(aborted, bool):
        raise Refusal()
    session: dict[str, object] = {
        "aborted": aborted,
        "composite": number_or_null(value.get("composite")),
        "confounders": confounders(value.get("confounders")),
    }
    if "trend" in value and value.get("trend") is not None:
        session["trend"] = trend_block(value.get("trend"))
    return session


def blank_trend(prior: list[dict[str, object]]) -> dict[str, object]:
    completed = [
        session
        for session in prior
        if session["aborted"] is False and session["composite"] is not None
    ]
    clean = [
        session
        for session in completed
        if session["confounders"]["poor_sleep"] is False
        and session["confounders"]["unwell_or_alcohol"] is False
    ]
    return {
        "n_prior": len(completed),
        "n_prior_clean": len(clean),
        "baseline_mean": None,
        "baseline_sd": None,
        "z": None,
        "flag": "insufficient_baseline",
    }


def trend_for(prior: list[dict[str, object]], composite: float) -> dict[str, object]:
    completed = [
        session
        for session in prior
        if session["aborted"] is False and session["composite"] is not None
    ]
    clean = [
        session
        for session in completed
        if session["confounders"]["poor_sleep"] is False
        and session["confounders"]["unwell_or_alcohol"] is False
    ]
    n_prior_clean = len(clean)
    if n_prior_clean < MIN_BASELINE:
        return blank_trend(prior)

    baseline = clean[-MIN_BASELINE:]
    mean = sum(float(session["composite"]) for session in baseline) / len(baseline)
    variance = (
        sum((float(session["composite"]) - mean) ** 2 for session in baseline)
        / len(baseline)
    )
    sd = math.sqrt(variance)
    z = 0.0 if sd == 0 else (composite - mean) / sd
    result = "within_range"
    if z > Z_ABOVE:
        result = "above_range"
    elif z < Z_BELOW:
        result = "below_range"

    previous = next(
        (session for session in reversed(completed) if session.get("trend")),
        None,
    )
    if result == "below_range" and previous is not None:
        previous_flag = previous["trend"]["flag"]
        if previous_flag in {"below_range", "review_suggested"}:
            result = "review_suggested"

    return {
        "n_prior": len(completed),
        "n_prior_clean": n_prior_clean,
        "baseline_mean": js_round(mean),
        "baseline_sd": js_round(sd),
        "z": js_round(z),
        "flag": result,
    }


def log_session(payload: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise Refusal()
    refuse_words(payload)

    try:
        uuid.UUID(str(payload.get("id")))
    except (ValueError, TypeError, AttributeError):
        raise Refusal() from None

    recorded_at = payload.get("recorded_at")
    date = payload.get("date")
    window = payload.get("window")
    aborted = payload.get("aborted")
    if not isinstance(recorded_at, str) or "T" not in recorded_at:
        raise Refusal()
    if not isinstance(date, str) or len(date) != 10 or date[4] != "-" or date[7] != "-":
        raise Refusal()
    if not isinstance(window, str) or not window.replace("_", "").isalpha() or len(window) > 32:
        raise Refusal()
    if not isinstance(aborted, bool):
        raise Refusal()

    prior_raw = payload.get("prior", [])
    if not isinstance(prior_raw, list):
        raise Refusal()
    prior = [prior_session(item) for item in prior_raw]

    composite = number_or_null(payload.get("composite"))
    core = number_or_null(payload.get("core_recall"))
    detail = number_or_null(payload.get("detail_recall"))
    intrusion = number_or_null(payload.get("intrusion_rate"))
    marks = confounders(payload.get("confounders"))

    trend = (
        blank_trend(prior)
        if aborted or composite is None
        else trend_for(prior, composite)
    )

    return {
        "id": str(payload["id"]),
        "recorded_at": recorded_at,
        "date": date,
        "window": window,
        "aborted": aborted,
        "composite": composite,
        "core_recall": core,
        "detail_recall": detail,
        "intrusion_rate": intrusion,
        "confounders": marks,
        "trend": trend,
    }


def main() -> int:
    raw = sys.stdin.read()
    try:
        record = log_session(json.loads(raw))
    except (json.JSONDecodeError, Refusal):
        sys.stderr.write("Session record refused.\n")
        return 2
    json.dump(record, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
