# Hackathon demo

One member (`USER1_EMAIL`). Partner rows are synthetic. `/demo` reads a Neon snapshot, never BigQuery.

## Rehearsal

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

3. Export the last 30 days (same path as the 03:00 cron):

```bash
WAREHOUSE_LAND=prod pnpm warehouse:land-user1
```

Or `curl -H "Authorization: Bearer $CRON_SECRET" "https://theordinary.club/api/cron/warehouse-export?days=30"`.

4. Dataform, impersonating `ordinary-dataform`, or the Warehouse workflow:

```bash
npx @dataform/cli@3.1.0 run --project-dir warehouse/dataform --tags spine
npx @dataform/cli@3.1.0 run --project-dir warehouse/dataform --tags studies
npx @dataform/cli@3.1.0 run --project-dir warehouse/dataform --tags effects_test
npx @dataform/cli@3.1.0 run --project-dir warehouse/dataform --tags effects
```

Check the frame:

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

5. Baseline band. With `spine` and `studies` built, run the Chronos-2 job in London (deploy once with `warehouse/forecast/setup.sh`), then the leakage assertion:

```bash
pnpm forecast:run
npx @dataform/cli@3.1.0 run --project-dir warehouse/dataform --tags forecast
```

Check the segments:

```sql
select feature_id, history_segment, status, count(*) n
from `the-ordinary-512212.ordinary_effects.forecasts`
group by 1, 2, 3
order by 1, 2, 3;
```

6. Snapshot onto Neon and disk. The output names a band count per segment:

```bash
pnpm demo:snapshot barbara-dry-run
```

7. Open `/demo` as `USER1_EMAIL`, or with `SITE_PREVIEW_SECRET`. Do a check-in on your phone and watch "Latest check-in" update.

8. Offline fallback:

```bash
DEMO_SNAPSHOT_FILE=tmp/demo-snapshot.json pnpm dev
```

Record a screen capture as a backup.

## Stage script (five minutes)

1. The two JSONs. Partners are config. BARBARA measures; Spotify would act.
2. The live check-in card. This is the only live Neon read.
3. The 30-day timeline. Gaps are real missing days. Partner points are labelled synthetic.
   The grey band is what Chronos-2 expected from the weeks before. The blue line is what actually happened. No experiment yet, so they should mostly agree. Once an experiment starts, the gap is what we measure.
   Lighter dashed bands are early estimates from 5 to 13 days of history. Measures with fewer days say so instead of drawing a band.
4. Scenario A planted +4, scenario B planted 0. Then the observational bars: association, not cause, one member, 30 days.
5. What production adds: invites, consent, study IDs, tasks, partner reports, member insights, Spotify components.

## Fallback

If London is unreachable, use `tmp/demo-snapshot.json` from the last good `pnpm demo:snapshot` and open `/demo` locally. A snapshot taken before `pnpm forecast:run` still loads; it just has no band.
