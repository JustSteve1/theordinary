#!/usr/bin/env python3
"""Append a scored session to the local JSONL store, compute the person's own baseline,
and emit a one-line Bee fact.

  log_session.py --score score.json --window window.json \
      --confounders '{"poor_sleep": false, "unwell_or_alcohol": false}' \
      --store ~/.episodic-recall/sessions.jsonl --out session.json [--aborted]

Trend flags:
  insufficient_baseline  fewer than MIN_BASELINE prior sessions
  within_range           |z| < 1.5
  above_range            z >= 1.5
  below_range            z <= -1.5 (single session)
  review_suggested       this and the previous session both <= -1.5
"""
import argparse
import json
import os
import statistics
import sys
from datetime import datetime, timezone

MIN_BASELINE = 5
Z_CUT = 1.5


def load_store(path):
    rows = []
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--score", required=True)
    ap.add_argument("--window", required=True)
    ap.add_argument("--confounders", default="{}")
    ap.add_argument("--store", default=os.path.expanduser("~/.episodic-recall/sessions.jsonl"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--aborted", action="store_true")
    ap.add_argument("--no-append", action="store_true", help="compute but do not write to store")
    a = ap.parse_args()

    with open(a.score) as f:
        sc = json.load(f)
    with open(a.window) as f:
        win = json.load(f)
    conf = json.loads(a.confounders)

    store = os.path.expanduser(a.store)
    prior = [r for r in load_store(store) if not r.get("aborted") and r.get("composite") is not None]
    # baseline excludes sessions with confounders flagged
    clean = [r["composite"] for r in prior
             if not (r.get("confounders", {}).get("poor_sleep") or
                     r.get("confounders", {}).get("unwell_or_alcohol"))]

    comp = None if a.aborted else sc.get("composite")
    trend = {"n_prior": len(prior), "n_prior_clean": len(clean),
             "baseline_mean": None, "baseline_sd": None, "z": None, "flag": "insufficient_baseline"}
    if comp is not None and len(clean) >= MIN_BASELINE:
        mean = statistics.mean(clean)
        sd = statistics.pstdev(clean) or 1.0
        z = (comp - mean) / sd
        trend.update(baseline_mean=round(mean, 1), baseline_sd=round(sd, 1), z=round(z, 2))
        if z <= -Z_CUT:
            last = prior[-1] if prior else None
            last_z = (last or {}).get("trend", {}).get("z")
            trend["flag"] = "review_suggested" if (last_z is not None and last_z <= -Z_CUT) else "below_range"
        elif z >= Z_CUT:
            trend["flag"] = "above_range"
        else:
            trend["flag"] = "within_range"

    row = {
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "date": win.get("date"), "window": win.get("window"),
        "conversation_ids": win.get("conversation_ids", []),
        "aborted": bool(a.aborted),
        "composite": comp,
        "core_recall": sc.get("core_recall"), "detail_recall": sc.get("detail_recall"),
        "intrusion_rate": sc.get("intrusion_rate"), "unsure_rate": sc.get("unsure_rate"),
        "n_truth": sc.get("n_truth"), "n_core": sc.get("n_core"), "n_recall": sc.get("n_recall"),
        "per_type_recall": sc.get("per_type_recall"),
        "confounders": conf,
        "trend": trend,
    }

    if a.aborted:
        fact = f"Episodic recall check-in {row['date']} ({row['window']}): not completed."
    else:
        conf_note = []
        if conf.get("poor_sleep"):
            conf_note.append("poor sleep")
        if conf.get("unwell_or_alcohol"):
            conf_note.append("unwell/alcohol")
        zs = f", z={trend['z']:+.2f} vs own baseline" if trend["z"] is not None else \
             f", baseline {len(clean)}/{MIN_BASELINE}"
        cn = f" [{', '.join(conf_note)}]" if conf_note else ""
        fact = (f"Episodic recall check-in {row['date']} ({row['window']}): "
                f"composite {comp}/100, core recall {sc.get('core_recall')}{zs}, "
                f"flag={trend['flag']}{cn}.")
    row["bee_fact"] = fact

    if not a.no_append:
        os.makedirs(os.path.dirname(store) or ".", exist_ok=True)
        with open(store, "a") as f:
            f.write(json.dumps(row) + "\n")
    with open(a.out, "w") as f:
        json.dump(row, f, indent=2)

    print(json.dumps({"composite": comp, **trend}))
    print("bee_fact:", fact)
    return 0


if __name__ == "__main__":
    sys.exit(main())
