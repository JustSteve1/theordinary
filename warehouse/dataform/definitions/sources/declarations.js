const raw = [
  "whoop_cycle",
  "whoop_recovery",
  "whoop_sleep",
  "whoop_workout",
  "app_members",
  "app_consents",
  "app_checkins",
  "app_score_runs",
  "app_recall_sessions",
  "bee_activity",
  "bee_daily",
  "partner_measures",
];

raw.forEach((name) => {
  declare({ database: "the-ordinary-512212", schema: "ordinary_raw", name });
});

["experiments", "experiment_enrolments", "decision_points"].forEach((name) => {
  declare({ database: "the-ordinary-512212", schema: "ordinary_experiments", name });
});
