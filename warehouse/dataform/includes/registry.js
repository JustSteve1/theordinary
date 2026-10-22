const BASE = [
  column("whoop.recovery_score", "recovery_score", "Recovery score", "score", "whoop", "Local date the associated sleep ended.", "Recovery score from the WHOOP payload.", true, 0),
  column("whoop.hrv_rmssd_ms", "hrv_rmssd_ms", "HRV RMSSD", "ms", "whoop", "Local date the associated sleep ended.", "hrv_rmssd_milli from recovery.", true, 0),
  column("whoop.resting_hr_bpm", "resting_hr_bpm", "Resting heart rate", "bpm", "whoop", "Local date the associated sleep ended.", "resting_heart_rate from recovery.", false, 0),
  column("whoop.spo2_pct", "spo2_pct", "SpO2", "percent", "whoop", "Local date the associated sleep ended.", "spo2_percentage from recovery.", true, 0),
  column("whoop.skin_temp_c", "skin_temp_c", "Skin temperature", "celsius", "whoop", "Local date the associated sleep ended.", "skin_temp_celsius from recovery.", null, 0),
  column("whoop.respiratory_rate", "respiratory_rate", "Respiratory rate", "breaths per minute", "sleep", "Local date the sleep ended. Naps are excluded.", "respiratory_rate from sleep.", null, 0),
  column("whoop.sleep_asleep_min", "sleep_asleep_min", "Asleep minutes", "minutes", "sleep", "Local date the sleep ended. Naps are excluded.", "Light plus deep plus REM, in minutes.", true, 0),
  column("whoop.sleep_deep_min", "sleep_deep_min", "Deep sleep", "minutes", "sleep", "Local date the sleep ended. Naps are excluded.", "Slow-wave sleep, in minutes.", true, 0),
  column("whoop.sleep_rem_min", "sleep_rem_min", "REM sleep", "minutes", "sleep", "Local date the sleep ended. Naps are excluded.", "REM sleep, in minutes.", true, 0),
  column("whoop.sleep_efficiency_pct", "sleep_efficiency_pct", "Sleep efficiency", "percent", "sleep", "Local date the sleep ended. Naps are excluded.", "sleep_efficiency_percentage.", true, 0),
  column("whoop.sleep_performance_pct", "sleep_performance_pct", "Sleep performance", "percent", "sleep", "Local date the sleep ended. Naps are excluded.", "sleep_performance_percentage.", true, 0),
  column("whoop.sleep_consistency_pct", "sleep_consistency_pct", "Sleep consistency", "percent", "sleep", "Local date the sleep ended. Naps are excluded.", "sleep_consistency_percentage.", true, 0),
  column("whoop.sleep_disturbances", "sleep_disturbances", "Sleep disturbances", "count", "sleep", "Local date the sleep ended. Naps are excluded.", "disturbance_count from sleep.", false, 0),
  column("whoop.sleep_midpoint_min", "sleep_midpoint_min", "Sleep midpoint", "minutes from local midnight", "sleep", "Local date the sleep ended. Naps are excluded.", "Clock time of the sleep midpoint, 0 to 1439.", null, 0),
  column("whoop.day_strain", "day_strain", "Day strain", "strain", "cycle", "Local date of cycle start, the waking period. A WHOOP physiological cycle runs from one wake to the next.", "Cycle strain.", null, 0),
  column("whoop.workout_count", "workout_count", "Workouts", "count", "workout", "Local date the workout started.", "Count of workouts that day.", null, 0),
  column("whoop.workout_strain_sum", "workout_strain_sum", "Workout strain", "strain", "workout", "Local date the workout started.", "Sum of workout strain that day.", null, 0),
  column("bee.conversation_count", "conversation_count", "Conversations", "count", "bee", "Local date of the activity start, in the member time zone. Ordinary echoes are excluded.", "Conversation count. Bee list calls do not document an end time, so this does not depend on duration.", null, 0),
  column("bee.conversation_minutes", "conversation_minutes", "Conversation minutes", "minutes", "bee", "Local date of the activity start. Echoes excluded.", "Sum of duration_s / 60. Null when Bee sends no end time.", null, 0),
  column("bee.journal_count", "journal_count", "Journals", "count", "bee", "Local date of the journal start. Echoes excluded.", "Journal count.", null, 0),
  column("bee.first_activity_min", "first_activity_min", "First activity", "minutes from local midnight", "bee", "Local date of the earliest non-echo activity.", "Minutes from local midnight.", null, 0),
  column("recall.accuracy", "accuracy", "Accuracy", "score", "recall", "Check-in target_date. Latest scorer per check-in. Practice excluded.", "accuracy from the score run.", true, 0),
  column("recall.richness", "richness", "Richness", "score", "recall", "Check-in target_date. Latest scorer per check-in. Practice excluded.", "richness from the score run.", true, 0),
  column("recall.false_alarm", "false_alarm", "False alarms", "score", "recall", "Check-in target_date. Latest scorer per check-in. Practice excluded.", "recognition_false_alarm from the score run.", false, 0),
  column("recall.intrusion", "intrusion", "Intrusion", "score", "recall", "Check-in target_date. Latest scorer per check-in. Practice excluded.", "intrusion from the score run.", false, 0),
  column("recall.dimension_mean", "dimension_mean", "Dimension mean", "score", "recall", "Check-in target_date. Latest scorer per check-in. Practice excluded.", "Mean of the four dimension levels.", true, 0),
  column("recall.lag_days", "lag_days", "Recall lag", "days", "recall", "Check-in target_date.", "conditions.lagDays.", null, 0),
  column("recall.mood", "mood", "Mood", "1 to 5", "recall", "Check-in target_date. Tapped at wrap-up on the evening of the check-in.", "One tap, 1 low to 5 great. An outcome, never a scoring input.", true, 0),
  column("confounder.poor_sleep", "poor_sleep", "Poor sleep", "0 or 1", "recall", "Session linked to the check-in.", "1 when the member marked poor sleep.", false, 0),
  column("confounder.unwell_or_alcohol", "unwell_or_alcohol", "Unwell or alcohol", "0 or 1", "recall", "Session linked to the check-in.", "1 when the member marked unwell or alcohol.", false, 0),
];

const DERIVED_PARENTS = [
  "whoop.hrv_rmssd_ms",
  "whoop.resting_hr_bpm",
  "whoop.recovery_score",
  "whoop.sleep_asleep_min",
  "recall.accuracy",
  "recall.richness",
];

function column(id, name, label, unit, source, dateRule, method, higher, minHistory) {
  return {
    id,
    column: name,
    label,
    unit,
    source,
    date_rule: dateRule,
    method,
    higher_is_better: higher,
    min_history_days: minHistory,
  };
}

function feature(id, label, unit, source, dateRule, method, higher, minHistory) {
  return {
    id,
    column: null,
    label,
    unit,
    source,
    date_rule: dateRule,
    method,
    higher_is_better: higher,
    min_history_days: minHistory,
  };
}

const DERIVED = DERIVED_PARENTS.flatMap((id) => {
  const parent = BASE.find((item) => item.id === id);
  return [
    feature(`${id}.baseline_28d`, `${parent.label} baseline`, parent.unit, parent.source, "Prior 28 calendar days, excluding today.", "Median. Null until 14 values.", null, 14),
    feature(`${id}.dev`, `${parent.label} deviation`, parent.unit, parent.source, "Same day as the parent feature.", "Value minus baseline_28d.", parent.higher_is_better, 14),
    feature(`${id}.dev_z`, `${parent.label} robust z`, "z", parent.source, "Same day as the parent feature.", "dev divided by 1.4826 times the MAD of the prior 28 days.", parent.higher_is_better, 14),
    feature(`${id}.delta_1d`, `${parent.label} day change`, parent.unit, parent.source, "Change from the previous calendar day.", "Value minus yesterday.", parent.higher_is_better, 1),
  ];
});

const EXTRA = [
  feature("whoop.sleep_midpoint_sd_7d", "Sleep midpoint regularity", "minutes", "sleep", "Prior 7 nights, excluding tonight.", "Standard deviation of clock-adjusted midpoints. Values after noon are shifted by -1440 so midnight wraps.", false, 7),
  feature("whoop.strain_minus_recovery", "Strain minus recovery", "score", "whoop", "Same local date as cycle strain and the recovery dated to that morning.", "day_strain / 21 * 100 minus recovery_score.", null, 0),
];

const FEATURES = [...BASE, ...EXTRA, ...DERIVED];

function sqlString(value) {
  if (value === null || value === undefined) {
    return "cast(null as string)";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlBool(value) {
  if (value === null || value === undefined) {
    return "cast(null as bool)";
  }
  return value ? "true" : "false";
}

function registrySelectSql() {
  return FEATURES.map(
    (item) => `select
      ${sqlString(item.id)} as feature_id,
      ${sqlString(item.label)} as label,
      ${sqlString(item.unit)} as unit,
      ${sqlString(item.source)} as source,
      ${sqlString(item.date_rule)} as date_rule,
      ${sqlString(item.method)} as method,
      ${sqlBool(item.higher_is_better)} as higher_is_better,
      '1.0.0' as version,
      ${item.min_history_days} as min_history_days`,
  ).join("\nunion all\n");
}

module.exports = { BASE, DERIVED_PARENTS, FEATURES, registrySelectSql };
