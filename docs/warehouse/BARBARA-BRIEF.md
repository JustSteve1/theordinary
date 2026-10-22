# BARBARA brief

Research only. Not a diagnosis. The biomarker never appears in the app.

## Question

Do daily Ordinary and WHOOP features carry signal for a leading indicator **as BARBARA defines it**?

## Target Y

Until BARBARA publish a composite, Y is:

`marker_present` = `biomarker.ptau217_group = 'positive'`

The digital-battery cutoff is unset (`battery_below_cutoff` is null). When they give a number, set `BARBARA_BATTERY_CUTOFF` in [`src/platform/experiments/barbara.ts`](../../src/platform/experiments/barbara.ts) and the matching SQL.

## Predictors X

Window summaries on `ordinary_effects.study_frame_long`:

- `recall.accuracy`, `recall.richness`, `recall.false_alarm`
- `whoop.sleep_asleep_min`, `whoop.hrv_rmssd_ms`

## Design

`monitoring_validation`. No arms. No cause-and-effect claim from this file.

| Table | What it is |
| --- | --- |
| `ordinary_effects.barbara_member_features` | One row per member: Y, X means, coverage |
| `ordinary_effects.barbara_timepoint_agreement` | Battery vs recall in the three days from each timepoint |
| `ordinary_effects.barbara_daily_pairs` | Sleep / HRV with same-day and next-day recall |
| `ordinary_effects.barbara_associations` | Pearson `r`, `not_causal = true` |

Saved queries: [`results.sql`](results.sql).

## What we will not claim

- Diagnosis or an in-app “you have a marker” line
- That sleep or HRV *causes* the marker
- A Chronos (or any) forecast as the BARBARA outcome. Chronos is parked for Spotify, London only. See [`SPOTIFY-CHRONOS.md`](SPOTIFY-CHRONOS.md).
