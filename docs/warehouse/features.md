# Features

Generated from `warehouse/dataform/includes/registry.js`. Do not edit by hand.
Regenerate with `node scripts/write-features-doc.mjs`.

`AI.DETECT_ANOMALIES` with TimesFM is not included. It is not confirmed in `europe-west2`, and this project does not query another region.

Sleep and recovery are dated to the local morning the sleep ended. A WHOOP physiological cycle is dated to the local date of its start, the waking period. Workouts use the local start date. `offset_days` on an experiment is relative to the decision date: 0 is that day, and 1 is the next morning.

| Feature | Unit | Date rule | Method | Higher is better | Min history |
| --- | --- | --- | --- | --- | --- |
| `whoop.recovery_score` | score | Local date the associated sleep ended. | Recovery score from the WHOOP payload. | yes | 0 |
| `whoop.hrv_rmssd_ms` | ms | Local date the associated sleep ended. | hrv_rmssd_milli from recovery. | yes | 0 |
| `whoop.resting_hr_bpm` | bpm | Local date the associated sleep ended. | resting_heart_rate from recovery. | no | 0 |
| `whoop.spo2_pct` | percent | Local date the associated sleep ended. | spo2_percentage from recovery. | yes | 0 |
| `whoop.skin_temp_c` | celsius | Local date the associated sleep ended. | skin_temp_celsius from recovery. |  | 0 |
| `whoop.respiratory_rate` | breaths per minute | Local date the sleep ended. Naps are excluded. | respiratory_rate from sleep. |  | 0 |
| `whoop.sleep_asleep_min` | minutes | Local date the sleep ended. Naps are excluded. | Light plus deep plus REM, in minutes. | yes | 0 |
| `whoop.sleep_deep_min` | minutes | Local date the sleep ended. Naps are excluded. | Slow-wave sleep, in minutes. | yes | 0 |
| `whoop.sleep_rem_min` | minutes | Local date the sleep ended. Naps are excluded. | REM sleep, in minutes. | yes | 0 |
| `whoop.sleep_efficiency_pct` | percent | Local date the sleep ended. Naps are excluded. | sleep_efficiency_percentage. | yes | 0 |
| `whoop.sleep_performance_pct` | percent | Local date the sleep ended. Naps are excluded. | sleep_performance_percentage. | yes | 0 |
| `whoop.sleep_consistency_pct` | percent | Local date the sleep ended. Naps are excluded. | sleep_consistency_percentage. | yes | 0 |
| `whoop.sleep_disturbances` | count | Local date the sleep ended. Naps are excluded. | disturbance_count from sleep. | no | 0 |
| `whoop.sleep_midpoint_min` | minutes from local midnight | Local date the sleep ended. Naps are excluded. | Clock time of the sleep midpoint, 0 to 1439. |  | 0 |
| `whoop.day_strain` | strain | Local date of cycle start, the waking period. A WHOOP physiological cycle runs from one wake to the next. | Cycle strain. |  | 0 |
| `whoop.workout_count` | count | Local date the workout started. | Count of workouts that day. |  | 0 |
| `whoop.workout_strain_sum` | strain | Local date the workout started. | Sum of workout strain that day. |  | 0 |
| `bee.conversation_count` | count | Local date of the activity start, in the member time zone. Ordinary echoes are excluded. | Conversation count. Bee list calls do not document an end time, so this does not depend on duration. |  | 0 |
| `bee.conversation_minutes` | minutes | Local date of the activity start. Echoes excluded. | Sum of duration_s / 60. Null when Bee sends no end time. |  | 0 |
| `bee.journal_count` | count | Local date of the journal start. Echoes excluded. | Journal count. |  | 0 |
| `bee.first_activity_min` | minutes from local midnight | Local date of the earliest non-echo activity. | Minutes from local midnight. |  | 0 |
| `recall.accuracy` | score | Check-in target_date. Latest scorer per check-in. Practice excluded. | accuracy from the score run. | yes | 0 |
| `recall.richness` | score | Check-in target_date. Latest scorer per check-in. Practice excluded. | richness from the score run. | yes | 0 |
| `recall.false_alarm` | score | Check-in target_date. Latest scorer per check-in. Practice excluded. | recognition_false_alarm from the score run. | no | 0 |
| `recall.intrusion` | score | Check-in target_date. Latest scorer per check-in. Practice excluded. | intrusion from the score run. | no | 0 |
| `recall.dimension_mean` | score | Check-in target_date. Latest scorer per check-in. Practice excluded. | Mean of the four dimension levels. | yes | 0 |
| `recall.lag_days` | days | Check-in target_date. | conditions.lagDays. |  | 0 |
| `recall.mood` | 1 to 5 | Check-in target_date. Tapped at wrap-up on the evening of the check-in. | One tap, 1 low to 5 great. An outcome, never a scoring input. | yes | 0 |
| `confounder.poor_sleep` | 0 or 1 | Session linked to the check-in. | 1 when the member marked poor sleep. | no | 0 |
| `confounder.unwell_or_alcohol` | 0 or 1 | Session linked to the check-in. | 1 when the member marked unwell or alcohol. | no | 0 |
| `whoop.sleep_midpoint_sd_7d` | minutes | Prior 7 nights, excluding tonight. | Standard deviation of clock-adjusted midpoints. Values after noon are shifted by -1440 so midnight wraps. | no | 7 |
| `whoop.strain_minus_recovery` | score | Same local date as cycle strain and the recovery dated to that morning. | day_strain / 21 * 100 minus recovery_score. |  | 0 |
| `whoop.hrv_rmssd_ms.baseline_28d` | ms | Prior 28 calendar days, excluding today. | Median. Null until 14 values. |  | 14 |
| `whoop.hrv_rmssd_ms.dev` | ms | Same day as the parent feature. | Value minus baseline_28d. | yes | 14 |
| `whoop.hrv_rmssd_ms.dev_z` | z | Same day as the parent feature. | dev divided by 1.4826 times the MAD of the prior 28 days. | yes | 14 |
| `whoop.hrv_rmssd_ms.delta_1d` | ms | Change from the previous calendar day. | Value minus yesterday. | yes | 1 |
| `whoop.resting_hr_bpm.baseline_28d` | bpm | Prior 28 calendar days, excluding today. | Median. Null until 14 values. |  | 14 |
| `whoop.resting_hr_bpm.dev` | bpm | Same day as the parent feature. | Value minus baseline_28d. | no | 14 |
| `whoop.resting_hr_bpm.dev_z` | z | Same day as the parent feature. | dev divided by 1.4826 times the MAD of the prior 28 days. | no | 14 |
| `whoop.resting_hr_bpm.delta_1d` | bpm | Change from the previous calendar day. | Value minus yesterday. | no | 1 |
| `whoop.recovery_score.baseline_28d` | score | Prior 28 calendar days, excluding today. | Median. Null until 14 values. |  | 14 |
| `whoop.recovery_score.dev` | score | Same day as the parent feature. | Value minus baseline_28d. | yes | 14 |
| `whoop.recovery_score.dev_z` | z | Same day as the parent feature. | dev divided by 1.4826 times the MAD of the prior 28 days. | yes | 14 |
| `whoop.recovery_score.delta_1d` | score | Change from the previous calendar day. | Value minus yesterday. | yes | 1 |
| `whoop.sleep_asleep_min.baseline_28d` | minutes | Prior 28 calendar days, excluding today. | Median. Null until 14 values. |  | 14 |
| `whoop.sleep_asleep_min.dev` | minutes | Same day as the parent feature. | Value minus baseline_28d. | yes | 14 |
| `whoop.sleep_asleep_min.dev_z` | z | Same day as the parent feature. | dev divided by 1.4826 times the MAD of the prior 28 days. | yes | 14 |
| `whoop.sleep_asleep_min.delta_1d` | minutes | Change from the previous calendar day. | Value minus yesterday. | yes | 1 |
| `recall.accuracy.baseline_28d` | score | Prior 28 calendar days, excluding today. | Median. Null until 14 values. |  | 14 |
| `recall.accuracy.dev` | score | Same day as the parent feature. | Value minus baseline_28d. | yes | 14 |
| `recall.accuracy.dev_z` | z | Same day as the parent feature. | dev divided by 1.4826 times the MAD of the prior 28 days. | yes | 14 |
| `recall.accuracy.delta_1d` | score | Change from the previous calendar day. | Value minus yesterday. | yes | 1 |
| `recall.richness.baseline_28d` | score | Prior 28 calendar days, excluding today. | Median. Null until 14 values. |  | 14 |
| `recall.richness.dev` | score | Same day as the parent feature. | Value minus baseline_28d. | yes | 14 |
| `recall.richness.dev_z` | z | Same day as the parent feature. | dev divided by 1.4826 times the MAD of the prior 28 days. | yes | 14 |
| `recall.richness.delta_1d` | score | Change from the previous calendar day. | Value minus yesterday. | yes | 1 |
