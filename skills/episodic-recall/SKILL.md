---
name: episodic-recall
description: Run an ecologically valid episodic free-recall session built from the person's own day, using Bee (bee.computer) conversation transcripts and daily summaries as ground truth. Use when the person asks for a memory check-in, recall session, or "test my memory of yesterday", or when a scheduled memory check-in fires. Requires the Bee MCP server (bee_* tools) and Python 3.9+. Not a diagnostic tool.
---

# Episodic Recall (Bee-grounded)

Free recall of real, personally experienced events, scored against what Bee actually captured.
The agent handles conversation and LLM-based fact extraction; the scripts in `scripts/` handle
window selection, deterministic scoring and longitudinal baselines so results are auditable.

**Why this design:** recall of personally experienced events is more sensitive to early memory
change than recall of word lists, and Bee gives a verifiable ground truth that clinic tests can't.
Hybrid scoring (LLM extracts atomic facts → code matches them) keeps the judgement reproducible.

## Hard rules

1. **Consent first, every time.** Never run a probe the person hasn't opted into. Explain what will
   be read from Bee and what will be stored. Store nothing until they agree.
2. **Never leak the answer.** Do not mention, summarise or hint at the target window's content
   before free recall is complete. Build ground truth silently.
3. **Never diagnose or label.** Report scores, trend and confounders only. If the trend flag is
   `review_suggested`, say the pattern is worth mentioning to a GP. Nothing more.
4. **No scoring from a single session.** Comparisons need ≥5 prior sessions; say so.
5. **Other people's speech is in the transcripts.** Use it only to build probes; never store or
   repeat third-party content in results or Bee facts.
6. **Stop if distressed.** If the person is upset or frustrated, end the session, record
   `aborted: true`, and don't score.

## Pipeline

Run the phases in order. Each phase lists the exact Bee tools and scripts.

### Phase 0 — Eligibility and consent

1. `bee_status` to confirm Bee is connected.
2. `bee_get_today` or `bee now`. If a conversation is `processing`/in progress, or the person is
   clearly mid-task, offer to do it later instead.
3. Ask for consent in plain words (template in `references/prompts.md` → *Consent*).
4. Ask the two confounder questions (sleep, feeling unwell/alcohol) — one message, yes/no each.
   Record answers; they are stored with the session and shown next to the score.

### Phase 1 — Pick the target window (silent)

Default target is **yesterday**, split into windows. Fetch:

- `bee_list_daily_summaries` → find yesterday's summary id → `bee_get_daily_summary`.
- `bee_list_conversations` with `since`/`until` bounding yesterday (epoch ms, person's timezone).

Save the conversation list to `work/conversations.json` (array of `{id, start_time, end_time,
short_summary, state}`) and run:

```
python3 scripts/select_window.py --conversations work/conversations.json \
    --tz Europe/London --date YYYY-MM-DD --out work/window.json
```

It picks the best-covered window (morning / afternoon / evening) with ≥2 completed conversations
and enough utterances, excluding very short ones. If it returns `"eligible": false`, tell the
person there wasn't enough captured yesterday and offer another day (`--date`).

Then for each conversation id in `window.json`: `bee_get_conversation_transcript`. Save to
`work/transcripts/<id>.json`.

### Phase 2 — Build ground truth (silent, LLM extraction)

Extract atomic facts from the transcripts + daily summary into `work/ground_truth.json` following
`references/extraction-schema.md` exactly. Rules that matter most:

- One fact per line; canonical short phrase; `type` from the fixed list.
- Mark `salience: core` for the 5–10 things a reasonable person would be expected to remember
  (who, main topic, outcome, where). Everything else is `detail`.
- Add `aliases` (first names, nicknames, synonyms) — the scorer uses them.
- Exclude anything spoken only by other people that the person could not plausibly know.
- Do **not** show this file to the person.

Validate: `python3 scripts/score_recall.py --validate work/ground_truth.json`.

### Phase 3 — Free recall (conversation)

Use the *Free recall* prompt in `references/prompts.md`. One open question for the window, e.g.
"Tell me everything you can about yesterday afternoon — who you were with, what you talked about,
what happened." Then exactly two neutral follow-ups: "Anything else?" and "Anything else at all?"
No cues, no confirmations, no reactions that signal right or wrong. Accept "I don't remember".

Record the verbatim answer in `work/recall_raw.txt`.

### Phase 4 — Extract recall facts (LLM)

From the person's answer only, extract atomic facts into `work/recall.json` using the same
schema (`references/extraction-schema.md`, *Recall side*). Mark `confidence: unsure` when they
hedged ("I think", "maybe"). Do not consult ground truth while extracting.

### Phase 5 — Score (deterministic)

```
python3 scripts/score_recall.py --truth work/ground_truth.json --recall work/recall.json \
    --out work/score.json
```

Outputs core/detail/overall recall, intrusion rate, per-type recall, composite (0–100), and the
match table. See `references/scoring.md` for the algorithm and thresholds.

### Phase 6 — Log, baseline, write back

```
python3 scripts/log_session.py --score work/score.json --window work/window.json \
    --confounders '{"poor_sleep": false, "unwell_or_alcohol": false}' \
    --store ~/.episodic-recall/sessions.jsonl --out work/session.json
```

Prints a trend block (`n_prior`, `baseline_mean`, `z`, `flag`) and a one-line `bee_fact` string.
Then: `bee_create_fact` with that text, and `bee_update_fact` with `confirmed: true`.

### Phase 7 — Feedback to the person

Use the *Feedback* template. Give: what they recalled well (by type), the composite, how it
compares to their own baseline (or that a baseline isn't established yet), and the confounders
they reported. Offer to show the missed core items **now**, since recall is complete. Never say
"normal", "impaired", "decline" or a condition name.

## Scheduling

If the person wants this regularly, create a scheduled task with the host's scheduler (not cron
inside this session) at a fixed time of day, 2–3× per week. Consistency of time-of-day matters more
than frequency.

## Files

```
episodic-recall/
├── SKILL.md
├── README.md
├── scripts/
│   ├── select_window.py   # choose window from Bee conversation list
│   ├── score_recall.py    # deterministic matcher; --validate for schema check
│   └── log_session.py     # JSONL store, baseline z-score, Bee fact text
├── references/
│   ├── extraction-schema.md
│   ├── scoring.md
│   ├── prompts.md
│   └── safety.md
└── examples/
    ├── conversations.json
    ├── ground_truth.json
    └── recall.json
```

Dry run without Bee: `bash examples/run_example.sh`.
