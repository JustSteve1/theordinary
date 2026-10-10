#!/usr/bin/env python3
"""Deterministic matcher for episodic recall.

  score_recall.py --truth ground_truth.json --recall recall.json --out score.json [--reveal]
  score_recall.py --validate <ground_truth.json | recall.json>

See references/scoring.md for the algorithm.
"""
import argparse
import difflib
import json
import re
import sys
import unicodedata

TYPES = {"person", "place", "activity", "topic", "decision", "time", "object", "quantity"}
SALIENCE = {"core", "detail"}
STOP = {"the", "a", "an", "my", "our", "his", "her", "their", "some", "that", "this"}

W_CORE, W_DETAIL, W_INTRUSION = 0.65, 0.25, 0.10


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^\w\s]", " ", s.lower())
    toks = [t for t in s.split() if t not in STOP]
    return " ".join(toks)


def sim(a, b):
    if not a or not b:
        return 0.0
    r = difflib.SequenceMatcher(None, a, b).ratio()
    ta, tb = set(a.split()), set(b.split())
    j = len(ta & tb) / len(ta | tb) if ta | tb else 0.0
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    # containment is strong evidence but not proof ("Dan" ⊂ "Dan's bike"); cap below exact
    c = 0.85 if (len(short) >= 3 and short in long_) else 0.0
    return max(r, j, c)


def best_sim(recall_text, truth):
    cands = [truth.get("text", "")] + list(truth.get("aliases") or [])
    best, via = 0.0, "text"
    rn = norm(recall_text)
    for i, c in enumerate(cands):
        s = sim(rn, norm(c))
        if s > best:
            best, via = s, ("text" if i == 0 else "alias")
    return best, via


def validate(doc, kind):
    errs = []
    facts = doc.get("facts")
    if not isinstance(facts, list) or not facts:
        return ["'facts' must be a non-empty list"]
    seen = set()
    for i, f in enumerate(facts):
        where = f"facts[{i}]"
        fid = f.get("id")
        if not fid or fid in seen:
            errs.append(f"{where}: missing or duplicate id")
        seen.add(fid)
        if f.get("type") not in TYPES:
            errs.append(f"{where}: bad type {f.get('type')!r}")
        if not (f.get("text") or "").strip():
            errs.append(f"{where}: empty text")
        if kind == "truth":
            if f.get("salience") not in SALIENCE:
                errs.append(f"{where}: bad salience {f.get('salience')!r}")
            if f.get("aliases") is not None and not isinstance(f["aliases"], list):
                errs.append(f"{where}: aliases must be a list")
        else:
            if f.get("confidence", "certain") not in ("certain", "unsure"):
                errs.append(f"{where}: bad confidence")
    return errs


def detect_kind(doc):
    return "truth" if any("salience" in f for f in doc.get("facts", [])) else "recall"


def score(truth, recall, thr, xthr, reveal):
    tf, rf = truth["facts"], recall["facts"]
    pairs = []
    for r in rf:
        for t in tf:
            s, via = best_sim(r["text"], t)
            same = r["type"] == t["type"]
            need = thr if same else xthr
            if s >= need:
                # sort key: similarity, then same-type wins ties, then stable by ids
                pairs.append((round(s, 6), 1 if same else 0, r["id"], t["id"], via))
    pairs.sort(key=lambda p: (-p[0], -p[1], p[2], p[3]))
    used_r, used_t, matches = set(), set(), []
    for s, _same, rid, tid, via in pairs:
        if rid in used_r or tid in used_t:
            continue
        used_r.add(rid); used_t.add(tid)
        matches.append({"recall_id": rid, "truth_id": tid, "similarity": round(s, 3), "via": via})

    core = [t for t in tf if t["salience"] == "core"]
    detail = [t for t in tf if t["salience"] == "detail"]

    def frac(items):
        return round(sum(1 for t in items if t["id"] in used_t) / len(items), 3) if items else None

    core_r, det_r, all_r = frac(core), frac(detail), frac(tf)
    intr = round((len(rf) - len(used_r)) / len(rf), 3) if rf else 0.0
    unsure = round(sum(1 for r in rf if r.get("confidence") == "unsure") / len(rf), 3) if rf else 0.0

    per_type = {}
    for ty in sorted(TYPES):
        items = [t for t in tf if t["type"] == ty]
        if items:
            per_type[ty] = frac(items)

    comp = 100 * (W_CORE * (core_r or 0.0) + W_DETAIL * (det_r if det_r is not None else (core_r or 0.0))
                  + W_INTRUSION * (1 - intr))
    comp = round(max(0.0, min(100.0, comp)), 1)

    misses = []
    for t in tf:
        if t["id"] not in used_t:
            m = {"truth_id": t["id"], "salience": t["salience"], "type": t["type"]}
            if reveal:
                m["text"] = t["text"]
            misses.append(m)
    intrusions = [{"recall_id": r["id"], "type": r["type"], "text": r["text"]}
                  for r in rf if r["id"] not in used_r]

    return {
        "date": truth.get("date"), "window": truth.get("window"),
        "n_truth": len(tf), "n_core": len(core), "n_recall": len(rf),
        "core_recall": core_r, "detail_recall": det_r, "overall_recall": all_r,
        "intrusion_rate": intr, "unsure_rate": unsure,
        "per_type_recall": per_type, "composite": comp,
        "thresholds": {"same_type": thr, "cross_type": xthr},
        "matches": matches, "misses": misses, "intrusions": intrusions,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--truth"); ap.add_argument("--recall"); ap.add_argument("--out")
    ap.add_argument("--validate", metavar="FILE")
    ap.add_argument("--threshold", type=float, default=0.60)
    ap.add_argument("--cross-threshold", type=float, default=0.80)
    ap.add_argument("--reveal", action="store_true", help="include missed fact text")
    a = ap.parse_args()

    if a.validate:
        with open(a.validate) as f:
            doc = json.load(f)
        errs = validate(doc, detect_kind(doc))
        print("OK" if not errs else "\n".join(errs))
        return 0 if not errs else 1

    if not (a.truth and a.recall and a.out):
        ap.error("--truth, --recall and --out are required (or use --validate)")
    with open(a.truth) as f:
        truth = json.load(f)
    with open(a.recall) as f:
        recall = json.load(f)
    errs = validate(truth, "truth") + validate(recall, "recall")
    if errs:
        print("\n".join(errs), file=sys.stderr)
        return 1
    for r in recall["facts"]:
        r.setdefault("confidence", "certain")

    out = score(truth, recall, a.threshold, a.cross_threshold, a.reveal)
    with open(a.out, "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps({k: out[k] for k in ("composite", "core_recall", "detail_recall",
                                          "intrusion_rate", "n_truth", "n_recall")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
