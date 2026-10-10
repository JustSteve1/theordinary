#!/usr/bin/env bash
# Dry run of the deterministic pipeline using sample data (no Bee required).
set -euo pipefail
cd "$(dirname "$0")/.."
W=examples/work; mkdir -p "$W"
STORE="$W/sessions.jsonl"; rm -f "$STORE"

echo "== select_window"
python3 scripts/select_window.py --conversations examples/conversations.json \
  --date 2026-10-09 --tz Europe/London --out "$W/window.json" || true

echo "== validate"
python3 scripts/score_recall.py --validate examples/ground_truth.json
python3 scripts/score_recall.py --validate examples/recall.json

echo "== score"
python3 scripts/score_recall.py --truth examples/ground_truth.json --recall examples/recall.json \
  --out "$W/score.json"

echo "== log (seed 5 prior sessions, then this one)"
for c in 71 68 74 70 66; do
  python3 - "$W/score.json" "$c" <<'EOF'
import json,sys
p,c=sys.argv[1],float(sys.argv[2]); d=json.load(open(p)); d["composite"]=c
json.dump(d,open(p.replace("score.json","seed.json"),"w"))
EOF
  python3 scripts/log_session.py --score "$W/seed.json" --window "$W/window.json" \
    --store "$STORE" --out "$W/seed_out.json" >/dev/null
done
python3 scripts/log_session.py --score "$W/score.json" --window "$W/window.json" \
  --confounders '{"poor_sleep": false, "unwell_or_alcohol": false}' \
  --store "$STORE" --out "$W/session.json"

echo "== done; outputs in $W/"
