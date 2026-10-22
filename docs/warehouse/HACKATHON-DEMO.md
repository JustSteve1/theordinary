# Hackathon demo

One member (`USER1_EMAIL`). The first act is the product on Home: the evening check-in, the morning pipelines, the health and mindset experiments with their nudges and rewards, and the Chronos-2 baseline band. The second act is the one-member partner study on `/demo`. Neither page reads BigQuery; Home reads Neon rows that the pipelines wrote, and `/demo` reads a Neon snapshot.

## The flow in one sentence

Every evening you talk for three minutes about yesterday and tap a mood. Overnight WHOOP and Bee land in London, Dataform turns them into daily features, Chronos-2 forecasts how you will answer next week, and a randomised experiment decides whether this morning's card nudges you. Over weeks, the gap between the forecast band and the actual line, split by arm, is the effect.

## Rehearsal

### Act one: the Home flow

1. Env on Vercel: `NUDGES_ENABLED=true`, `NUDGE_SALT` and `EXPERIMENT_SALT` (32+ characters), the warehouse variables, `CRON_SECRET`. Repo variables `FORECAST_JOB_ENABLED=true` and `APP_URL=https://theordinary.club`, repo secret `CRON_SECRET`.

2. Activate both production experiments. They enrol `USER1_EMAIL`. Each refuses unless `recall.mood` is in `feature_registry` with at least 14 non-null days, so do a fortnight of evening check-ins with the mood tap first (or point `primary` at `recall.accuracy` on a fresh version for a rehearsal).

```bash
pnpm experiments:activate health-recovery-nudge
pnpm experiments:activate mindset-bee-nudge
```

3. Run one morning by hand, in cron order:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://theordinary.club/api/cron/whoop-sync?days=30"
curl -H "Authorization: Bearer $CRON_SECRET" "https://theordinary.club/api/cron/experiments-decide"
curl -H "Authorization: Bearer $CRON_SECRET" "https://theordinary.club/api/cron/nudges-morning"
curl -H "Authorization: Bearer $CRON_SECRET" "https://theordinary.club/api/cron/warehouse-export?days=30"
```

Each answers with counts, or `{ "skipped": true, "reason": "..." }` if it had nothing to do. The reasons are listed in [`RUNBOOK.md`](RUNBOOK.md).

4. Run the Warehouse workflow from GitHub (`workflow_dispatch`). It runs `spine`, `studies`, `effects_test`, `effects`, then the Chronos-2 job, the `forecast` assertions, and `/api/cron/baseline-snapshot`. Without the Cloud Run job, run the first four tags and skip to step 6 with the empty-state card.

5. Check the tables, in this order on stage:

```sql
-- Mood arrived without speech
select member_key, date, mood, accuracy, richness
from `the-ordinary-512212.ordinary_core.recall_daily`
order by date desc limit 14;

-- Every day exists, even quiet ones
select date, recovery_score, conversation_count, accuracy, mood
from `the-ordinary-512212.ordinary_core.daily_wide`
order by date desc limit 14;

-- Features Chronos-2 and the experiments read
select feature_id, count(*) days, countif(value is not null) filled
from `the-ordinary-512212.ordinary_features.features_daily`
where feature_id in ('recall.accuracy', 'recall.richness', 'recall.mood', 'whoop.recovery_score', 'bee.conversation_minutes')
group by 1 order by 1;

-- Today's arms, one per experiment
select experiment_id, decision_date, available, arm, probability, response
from `the-ordinary-512212.ordinary_experiments.decision_points`
order by decision_date desc limit 10;

-- Nudges and rewards, sent or held, no text
select rule_id, domain, kind, decision, status, created_at
from `the-ordinary-512212.ordinary_raw.app_nudges`
order by created_at desc limit 10;

-- The baseline Chronos-2 drew
select feature_id, history_segment, status, count(*) n
from `the-ordinary-512212.ordinary_effects.forecasts`
group by 1, 2, 3 order by 1, 2, 3;
```

Then `pnpm warehouse:status` for the one-line-per-check view.

6. Open Home as `USER1_EMAIL`. Top to bottom: "Evening check-in", the day card (today's experiment instruction with Done and Skipped, a Bee anchor under a mindset treatment, any sent nudge or reward with its domain tag), and "Your baseline" with the Accuracy and Richness bands. Tap through a check-in on the phone and tap a mood at wrap-up; the card says "Noted. That goes next to tonight's check-in, not into the score."

### Act two: the partner study on `/demo`

Dates below use a 30-day window. Replace `<30 days ago>` with today's London date minus 30 days (`YYYY-MM-DD`).

1. Activate the dry run and enrol yourself on the existing warehouse month:

```bash
pnpm experiments:activate barbara-dry-run --enrol-me --start <30 days ago>
```

`barbara-recall-monitoring-pilot` is not in this cut. `experiments/concepts/spotify-mood-lift.json` cannot be activated.

2. Write and import synthetic partner measures:

```bash
pnpm partner:sample-file barbara-dry-run
pnpm partner:import barbara-dry-run tmp/partner-barbara-dry-run.csv --dry-run
pnpm partner:import barbara-dry-run tmp/partner-barbara-dry-run.csv
```

3. Export and rebuild as in act one (or `WAREHOUSE_LAND=prod pnpm warehouse:land-user1` locally). Check the frame:

```sql
select source, measure_id, count(*) n,
  countif(value_number is not null or value_category is not null) filled
from `the-ordinary-512212.ordinary_effects.study_frame_long`
where experiment_id = 'barbara-dry-run'
group by 1, 2
order by 1, 2;

select * from `the-ordinary-512212.ordinary_effects.study_coverage`
where experiment_id = 'barbara-dry-run';
```

4. Snapshot onto Neon and disk. The output names a band count per segment:

```bash
pnpm demo:snapshot barbara-dry-run
```

5. Open `/demo` as `USER1_EMAIL`, or with `SITE_PREVIEW_SECRET`.

6. Offline fallback:

```bash
DEMO_SNAPSHOT_FILE=tmp/demo-snapshot.json pnpm dev
```

Record a screen capture of both pages as a backup.

## Stage script (five minutes)

1. Home, phone in hand. "Every evening, three minutes about yesterday." Start a check-in, stop early, tap a mood. The score is Accuracy and Richness; the mood sits beside it.
2. The day card. One experiment per domain. Health reads WHOOP: "Your recovery is in. Pick one thing today." Mindset reads Bee: "On Tuesday Bee heard about Sam and Hackney." Arms are randomised each morning and stored; Done and Skipped are the response.
3. The baseline. "This grey band is what Chronos-2 expected me to score this week, from everything before." The blue line is what happened. No experiment has run long enough, so they agree. When they stop agreeing by arm, that is the effect.
4. The tables. `recall_daily` has a mood and no words. `daily_wide` has every day. `decision_points` has today's arm. `app_nudges` has the reward that was held. `forecasts` has the band. Members are an HMAC. London only.
5. `/demo`: the partner study. Scenario A planted +4, scenario B planted 0, the estimator found both. Then what production adds: invites, consent, study IDs, partner reports.

## Fallback

If London is unreachable, Home still renders from Neon: the check-in, the day card, and whatever baseline snapshot was last written (or the empty state, "Chronos-2 hasn't drawn your baseline yet."). For `/demo`, use `tmp/demo-snapshot.json` from the last good `pnpm demo:snapshot`. A snapshot taken before `pnpm forecast:run` still loads; it just has no band.
