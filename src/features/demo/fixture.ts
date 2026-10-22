import type { DemoSeriesPoint, DemoSnapshot } from "@/src/features/demo/snapshot";

const STUDY_START = "2026-09-21";

function daily(measure_id: string, values: (number | null)[], fromDay: number): DemoSeriesPoint[] {
  return values.map((value_number, index) => {
    const date = new Date(`${STUDY_START}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + fromDay + index);
    return { date: date.toISOString().slice(0, 10), measure_id, value_number, study_day: fromDay + index };
  });
}

const HRV = [42, 44, 41, 45, 43, null, 46, 44, 42, 47, 45, 43, 44, 46, 48, 45, 43, 44, null, 46, 47, 45, 44, 43, 46, 48, 45, 44, 47, 46];
const RECALL = [68, null, 71, null, null, 70, null, null, null, 69, null, null, null, 72, null, null, null, null, 70, null, null, null, 73, 71, null, 74, 72, null, 70, 73];

export const demoSnapshotFixture: DemoSnapshot = {
  experiment: {
    schema_version: 2,
    id: "barbara-dry-run",
    title: "BARBARA monitoring dry run",
    partner: { id: "barbara_alliance", name: "BARBARA Alliance", role: "measurement" },
    design: "monitoring_validation",
    duration_days: 30,
    schedule: { daily_measures: ["recall.accuracy"], timepoints: [{ id: "baseline", day: 0 }] },
    partner_measures: [{ id: "reference.digital_battery", type: "number", unit: "score" }],
  },
  concept: {
    id: "spotify-mood-lift",
    title: "Ten minutes of music, a lift in mood?",
    partner: { id: "spotify", name: "Spotify", role: "intervention" },
    design: "micro_randomised_intraday",
    decision_points: { windows_local: ["11:00", "15:30"] },
    measures: { mood_check: { items: ["valence_1_7"] } },
    primary_outcome: { measure: "mood_check.valence" },
  },
  series: [
    ...daily("recall.accuracy", RECALL, 0),
    ...daily("whoop.hrv_rmssd_ms", HRV, 0),
    ...daily("whoop.sleep_asleep_min", [410, null, 395, 420], 26),
  ],
  partner_points: [
    {
      date: "2026-09-21",
      measure_id: "reference.digital_battery",
      timepoint_id: "baseline",
      value_number: 72,
      value_category: null,
      is_synthetic: true,
    },
    {
      date: "2026-10-19",
      measure_id: "biomarker.ptau217_group",
      timepoint_id: "baseline",
      value_number: null,
      value_category: "negative",
      is_synthetic: true,
    },
  ],
  coverage: {
    daily_rows: 150,
    daily_filled: 110,
    daily_fill_rate: 0.73,
    partner_rows: 3,
    partner_filled: 3,
    daily_measures: [{ measure_id: "recall.accuracy", days: 30, filled: 18 }],
  },
  engine_proof: [
    { experiment_id: "A", beta: 3.8, p025: 1.2, p975: 6.1, status: "ok", true_effect: 4 },
    { experiment_id: "B", beta: 0.1, p025: -1.4, p975: 1.6, status: "ok", true_effect: 0 },
  ],
  associations: [
    {
      feature_id: "whoop.hrv_rmssd_ms.dev",
      beta: 0.4,
      p10: -0.2,
      p90: 1.1,
      p025: -0.5,
      p975: 1.4,
      prob_positive: 0.72,
      n_with_outcome: 22,
      not_causal: true,
    },
  ],
  generated_at: "2026-10-21T12:00:00.000Z",
  forecast_model: {
    model_id: "amazon/chronos-2",
    model_revision: "29ec3766d36d6f73f0696f85560a422f50e8498c",
    created_at: "2026-10-21T11:30:00.000Z",
  },
  forecast_bands: [
    {
      measure_id: "whoop.hrv_rmssd_ms",
      segment: "full",
      history_days: 21,
      window_start: "2026-10-14",
      window_end: "2026-10-20",
      status: "ok",
      points: [
        { date: "2026-10-14", q10: 40, q50: 44.5, q90: 49 },
        { date: "2026-10-15", q10: 40.2, q50: 44.6, q90: 49.2 },
        { date: "2026-10-16", q10: 40.1, q50: 44.8, q90: 49.4 },
        { date: "2026-10-17", q10: 39.8, q50: 44.7, q90: 49.6 },
        { date: "2026-10-18", q10: 39.6, q50: 44.9, q90: 50 },
        { date: "2026-10-19", q10: 39.5, q50: 45, q90: 50.3 },
        { date: "2026-10-20", q10: 39.3, q50: 45.1, q90: 50.6 },
      ],
      inside: 7,
      compared: 7,
    },
    {
      measure_id: "recall.accuracy",
      segment: "limited",
      history_days: 6,
      window_start: "2026-10-14",
      window_end: "2026-10-20",
      status: "ok",
      points: [
        { date: "2026-10-14", q10: 63, q50: 70, q90: 77 },
        { date: "2026-10-15", q10: 62.5, q50: 70, q90: 77.5 },
        { date: "2026-10-16", q10: 62, q50: 70.2, q90: 78 },
        { date: "2026-10-17", q10: 61.5, q50: 70.2, q90: 78.5 },
        { date: "2026-10-18", q10: 61, q50: 70.4, q90: 79 },
        { date: "2026-10-19", q10: 60.5, q50: 70.4, q90: 79.5 },
        { date: "2026-10-20", q10: 60, q50: 70.5, q90: 80 },
      ],
      inside: 5,
      compared: 5,
    },
    {
      measure_id: "whoop.sleep_asleep_min",
      segment: "insufficient",
      history_days: 3,
      window_start: "2026-10-14",
      window_end: "2026-10-20",
      status: "insufficient_history",
      points: [],
      inside: null,
      compared: null,
    },
  ],
};
