# Extraction schema

Both ground truth and recall use the same atomic-fact format so the scorer can match them.
One JSON object per file.

## Ground truth (`ground_truth.json`)

```json
{
  "date": "2026-10-09",
  "window": "afternoon",
  "window_start": "2026-10-09T12:00:00+01:00",
  "window_end":   "2026-10-09T18:00:00+01:00",
  "conversation_ids": [6531525, 6531601],
  "facts": [
    {
      "id": "gt-01",
      "type": "person",
      "text": "Sarah Chen",
      "aliases": ["Sarah", "Sarah from finance"],
      "salience": "core",
      "conversation_id": 6531525,
      "approx_time": "14:10"
    }
  ]
}
```

### Field rules

| Field | Rule |
|---|---|
| `id` | `gt-NN`, zero-padded, unique |
| `type` | one of `person`, `place`, `activity`, `topic`, `decision`, `time`, `object`, `quantity` |
| `text` | canonical, ≤8 words, no pronouns, no hedging |
| `aliases` | other ways the person might refer to it; include first name, role ("my manager"), synonyms. May be empty. |
| `salience` | `core` or `detail` (see below) |
| `conversation_id` | Bee conversation id the fact came from; omit if from daily summary only |
| `approx_time` | `HH:MM` local, optional |

### Types

- **person** — a named or role-identified participant ("Sarah", "the plumber"). Not the speaker themselves.
- **place** — where something happened ("Costa on the high street", "kitchen").
- **activity** — what was done ("reviewed Q3 budget", "walked the dog").
- **topic** — what was discussed, as a noun phrase ("holiday plans", "server outage").
- **decision** — an outcome or commitment ("agreed to move launch to November").
- **time** — a stated time or sequence marker ("after lunch", "about 3pm").
- **object** — a concrete thing mentioned ("new laptop", "birthday card").
- **quantity** — numbers that matter ("three candidates", "£400").

### Salience

Mark `core` for the facts a well-rested person who was present would be expected to recall
unprompted a day later. Target 5–10 core facts per window. Typically: each distinct person,
each distinct activity or meeting, the main topic of each, and any decision. Everything else is
`detail`.

### Exclusions

- Anything only another speaker knew and the person did not react to.
- Third-party private content not needed as a probe (health, finances of others).
- Speaker labels. Bee often labels speakers `Unknown`; never infer identity from the label alone.
- Facts the agent itself introduced in earlier conversation with the person.

## Recall side (`recall.json`)

```json
{
  "date": "2026-10-09",
  "window": "afternoon",
  "raw_text_file": "work/recall_raw.txt",
  "facts": [
    { "id": "r-01", "type": "person", "text": "Sarah", "confidence": "certain" },
    { "id": "r-02", "type": "topic",  "text": "the budget", "confidence": "unsure" }
  ]
}
```

- Extract **only** from the person's words. Do not read `ground_truth.json` while doing this.
- Keep their wording in `text`; the scorer handles fuzziness and aliases.
- `confidence`: `certain` by default; `unsure` if hedged ("I think", "maybe", "possibly").
- Negations ("I didn't see Tom") are **not** facts; skip them.
- Vague fillers ("stuff", "things", "a meeting") are extracted as `type: activity`, `text: "a meeting"`
  — they will usually score as a gist-level match only if an alias covers them.

## Validation

`python3 scripts/score_recall.py --validate <file>` checks ids, types, salience and required fields.
