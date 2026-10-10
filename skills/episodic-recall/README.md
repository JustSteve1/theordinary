# episodic-recall

An Agent Skill that runs an ecologically valid **episodic free-recall** session using the
person's own day, with [Bee](https://bee.computer) transcripts and daily summaries as ground
truth. The agent does the talking and the LLM fact extraction; small stdlib-only Python scripts do
window selection, deterministic scoring and longitudinal baselines.

Not a diagnostic tool. See `references/safety.md`.

## Install

```
npx skills add <your-github-user>/episodic-recall
```

or copy the `episodic-recall/` folder into your agent's skills directory
(`~/.claude/skills/`, `.claude/skills/`, or your harness's equivalent).

Requirements: Python 3.9+, Bee MCP connected (`bee mcp connect claude-code` or similar).

## Try it without Bee

```
bash examples/run_example.sh
```

Runs window selection on a sample conversation list, validates sample ground-truth and recall
files, scores them, seeds a baseline and logs a session.

## How a session runs

| Phase | Who | What |
|---|---|---|
| 0 | agent | consent, confounder questions, `bee_status` / `bee now` |
| 1 | agent + `select_window.py` | pick yesterday's best-covered window; fetch transcripts |
| 2 | agent (LLM) | extract atomic ground-truth facts (`references/extraction-schema.md`) |
| 3 | agent | one open free-recall question + two neutral "anything else?" |
| 4 | agent (LLM) | extract facts from the answer, without looking at ground truth |
| 5 | `score_recall.py` | fuzzy one-to-one matching → core/detail recall, intrusions, composite |
| 6 | `log_session.py` | append to JSONL, z-score vs own baseline, emit one Bee fact |
| 7 | agent | feedback; offer to reveal missed items now that recall is done |

## Plugging into your stack

- **Different ground-truth source** (calendar, email, another wearable): produce
  `ground_truth.json` in the schema and skip Phase 1. Scoring and logging are source-agnostic.
- **Different extractor**: anything that emits the schema works; the scorer doesn't care which
  model produced the facts.
- **Wearable confounders**: pass `--confounders` with your own keys (e.g. `{"hrv_low": true}`);
  `log_session.py` stores them, and treats `poor_sleep` / `unwell_or_alcohol` as baseline
  exclusions.
- **Store**: JSONL at `~/.episodic-recall/sessions.jsonl`. One row per session, no transcript text.

## Roadmap (not in v1)

Cued recall, text recognition with lures from other days, temporal-order probes, prospective
memory via Bee todos, Bee-photo recognition.

## Licence

MIT.
