# Scoring

`scripts/score_recall.py` is deterministic: same inputs → same output. No LLM calls.

## Matching

For each recall fact `r` and each ground-truth fact `g`:

1. **Normalise** both `text` (and every `g.alias`): lowercase, strip punctuation, drop leading
   articles/possessives (`the`, `a`, `an`, `my`, `our`), collapse whitespace.
2. **Similarity** = max over `g.text` + `g.aliases` of
   `max(difflib.SequenceMatcher ratio, token-set Jaccard, containment)` where containment = **0.85**
   when one normalised string is a substring of the other and the shorter has ≥3 characters.
   (Capped below 1.0 so "Dan" prefers the exact person *Dan* over the object *Dan's bike*.)
3. **Type gate**: same `type` → threshold **0.60**. Different type → threshold **0.80**
   (e.g. "the budget" tagged `topic` can still match an `activity` "reviewed Q3 budget").
4. Greedy one-to-one assignment: highest similarity first, same-type wins ties, then stable by id.
   Each `g` matches at most one `r`.

## Metrics

| Metric | Definition |
|---|---|
| `core_recall` | matched core facts / total core facts |
| `detail_recall` | matched detail facts / total detail facts |
| `overall_recall` | matched facts / total facts |
| `intrusion_rate` | unmatched recall facts / total recall facts |
| `unsure_rate` | recall facts marked `unsure` / total recall facts |
| `per_type_recall` | matched / total for each type with ≥1 ground-truth fact |
| `composite` | `100 × (0.65·core_recall + 0.25·detail_recall + 0.10·(1 − intrusion_rate))`, clamped 0–100 |

Core recall is weighted heavily because missing *who* and *what* is what matters; detail recall
varies a lot with how talkative the person is. Intrusions (saying things that didn't happen)
are penalised lightly: in healthy adults they're common and mostly reflect date confusion.

## Output (`score.json`)

```json
{
  "date": "...", "window": "...",
  "n_truth": 14, "n_core": 7, "n_recall": 9,
  "core_recall": 0.71, "detail_recall": 0.43, "overall_recall": 0.57,
  "intrusion_rate": 0.11, "unsure_rate": 0.22,
  "per_type_recall": {"person": 1.0, "topic": 0.5, ...},
  "composite": 62.9,
  "matches":   [{"recall_id":"r-01","truth_id":"gt-01","similarity":0.93,"via":"alias"}],
  "misses":    [{"truth_id":"gt-04","salience":"core","type":"decision"}],
  "intrusions":[{"recall_id":"r-07","text":"..."}]
}
```

`misses` carries no `text` by default so the file can be shown to the person without revealing
answers; pass `--reveal` to include it (Phase 7 only, after recall is finished).

## Known limits

- Fuzzy matching favours English word order. Names with diacritics are normalised to ASCII.
- A very long free-recall answer inflates `detail_recall`; compare composites, not raw counts.
- Thresholds are defaults chosen to be conservative. Tune with `--threshold` / `--cross-threshold`
  after ~20 sessions and keep them fixed thereafter, or baselines break.
