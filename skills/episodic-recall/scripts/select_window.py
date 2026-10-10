#!/usr/bin/env python3
"""Pick the best-covered recall window from a Bee conversation list.

Input: JSON array of conversations as returned by bee_list_conversations, each with
  id, start_time, end_time (epoch ms or ISO 8601), state, short_summary, and optionally
  utterance_count.

Output: window.json with eligible flag, chosen window, conversation ids.
"""
import argparse
import json
import sys
from datetime import datetime, time, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

WINDOWS = {
    "morning":   (time(6, 0),  time(12, 0)),
    "afternoon": (time(12, 0), time(18, 0)),
    "evening":   (time(18, 0), time(23, 59, 59)),
}


def parse_ts(v, tz):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        if v > 1e11:  # ms
            v = v / 1000
        return datetime.fromtimestamp(v, tz=timezone.utc).astimezone(tz)
    s = str(v).replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--conversations", required=True)
    ap.add_argument("--date", required=True, help="YYYY-MM-DD, the day being recalled")
    ap.add_argument("--tz", default="UTC")
    ap.add_argument("--min-convs", type=int, default=2)
    ap.add_argument("--min-minutes", type=int, default=3, help="ignore shorter conversations")
    ap.add_argument("--min-total-minutes", type=int, default=15)
    ap.add_argument("--prefer", choices=list(WINDOWS), default=None)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    tz = ZoneInfo(a.tz) if ZoneInfo else timezone.utc
    day = datetime.strptime(a.date, "%Y-%m-%d").date()

    with open(a.conversations) as f:
        convs = json.load(f)
    if isinstance(convs, dict):
        convs = convs.get("conversations", convs.get("items", []))

    buckets = {w: [] for w in WINDOWS}
    for c in convs:
        st = parse_ts(c.get("start_time"), tz)
        en = parse_ts(c.get("end_time"), tz) or st
        if not st or st.date() != day:
            continue
        state = str(c.get("state", "")).upper()
        if state and state not in ("COMPLETED", "PROCESSED"):
            continue
        minutes = max(0.0, (en - st).total_seconds() / 60)
        if minutes < a.min_minutes:
            continue
        for w, (ws, we) in WINDOWS.items():
            if ws <= st.time() <= we:
                buckets[w].append({
                    "id": c.get("id"),
                    "start": st.isoformat(),
                    "end": en.isoformat(),
                    "minutes": round(minutes, 1),
                    "summary": c.get("short_summary") or c.get("title") or "",
                })
                break

    def score(w):
        items = buckets[w]
        total = sum(i["minutes"] for i in items)
        ok = len(items) >= a.min_convs and total >= a.min_total_minutes
        return (ok, total, len(items))

    ranked = sorted(WINDOWS, key=score, reverse=True)
    if a.prefer and score(a.prefer)[0]:
        chosen = a.prefer
    else:
        chosen = ranked[0]
    eligible, total, n = score(chosen)

    ws, we = WINDOWS[chosen]
    out = {
        "date": a.date,
        "tz": a.tz,
        "eligible": bool(eligible),
        "window": chosen,
        "window_start": datetime.combine(day, ws, tz).isoformat(),
        "window_end": datetime.combine(day, we, tz).isoformat(),
        "n_conversations": n,
        "total_minutes": round(total, 1),
        "conversation_ids": [i["id"] for i in buckets[chosen]],
        "conversations": buckets[chosen],
        "all_windows": {w: {"n": len(buckets[w]),
                             "minutes": round(sum(i["minutes"] for i in buckets[w]), 1)}
                        for w in WINDOWS},
        "reason": None if eligible else
                  f"need >= {a.min_convs} conversations and >= {a.min_total_minutes} min; "
                  f"best window '{chosen}' has {n} conv / {round(total,1)} min",
    }
    with open(a.out, "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps({k: out[k] for k in ("eligible", "window", "n_conversations",
                                          "total_minutes", "conversation_ids", "reason")}))
    return 0 if eligible else 2


if __name__ == "__main__":
    sys.exit(main())
