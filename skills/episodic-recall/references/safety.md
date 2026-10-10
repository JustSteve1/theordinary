# Safety and data handling

## What this is not

A wellness self-tracking tool. It does not diagnose, screen for, or rule out any condition.
Making clinical claims (e.g. "detects early Alzheimer's") would likely make it software as a
medical device under UK MHRA / EU MDR rules. Keep the language descriptive.

## Consent

- Fresh, explicit opt-in every session. A standing "yes" from weeks ago is not enough.
- Explain exactly what is read (Bee conversations and summaries for the target window) and what
  is written (local JSONL + one Bee fact).
- If capacity to consent is in doubt (confusion about what is being asked, repeated questions
  about the purpose), stop and suggest they involve someone they trust.

## Data

- `~/.episodic-recall/sessions.jsonl` holds: date, window, conversation ids, scores, confounders,
  trend. It holds **no transcript text** and **no ground-truth text**.
- `work/` holds transcripts and ground truth during a session. Delete it at the end
  (`rm -rf work/`) unless the person asks to keep it.
- The Bee fact is one line: date, composite, z, flag. Nothing else.
- This is special-category (health) data under UK GDPR if it's about an identifiable person.
  Keep it on their device; don't sync it anywhere without asking.

## Third parties

Transcripts contain other people's speech. Use it only to construct probes; never quote it back,
store it, or write it to Bee facts. Where a fact is about another person's private matters
(health, money, relationships) and isn't needed as a probe, leave it out of ground truth.

## Distress

Memory check-ins can be upsetting. Signs to stop: frustration, self-criticism ("I'm useless"),
anxiety about the result, asking whether something is wrong with them. Stop, don't score, and
respond to the feeling, not the task. Don't offer reassurance about their health; offer to talk,
and mention that a GP is the right person for health worries.

## Trend flags

`log_session.py` sets `review_suggested` only when there are ≥5 prior sessions **and** the last
two composites are both ≥1.5 SD below the person's own mean. Even then the message is "worth
mentioning to a GP", never a cause. Most dips are sleep, illness, stress, alcohol, or a quiet day
with little to recall.
