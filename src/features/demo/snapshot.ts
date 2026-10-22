import { assertNoSpeech } from "@/src/platform/warehouse/firewall";

export type DemoSeriesPoint = {
  date: string;
  measure_id: string;
  value_number: number | null;
  study_day: number;
};

export type DemoPartnerPoint = {
  date: string;
  measure_id: string;
  timepoint_id: string;
  value_number: number | null;
  value_category: string | null;
  is_synthetic: boolean;
};

export type DemoCoverage = {
  daily_rows: number;
  daily_filled: number;
  daily_fill_rate: number | null;
  partner_rows: number;
  partner_filled: number;
  daily_measures?: { measure_id: string; days: number; filled: number }[];
};

export type DemoEngineRow = {
  experiment_id: string;
  beta: number | null;
  p025: number | null;
  p975: number | null;
  status: string;
  true_effect: number;
};

export type DemoAssociation = {
  feature_id: string;
  beta: number | null;
  p10: number | null;
  p90: number | null;
  p025: number | null;
  p975: number | null;
  prob_positive: number | null;
  n_with_outcome: number | null;
  not_causal: true;
};

export type DemoForecastSegment = "full" | "limited" | "insufficient";

export type DemoForecastPoint = {
  date: string;
  q10: number;
  q50: number;
  q90: number;
};

export type DemoForecastBand = {
  measure_id: string;
  segment: DemoForecastSegment;
  history_days: number;
  window_start: string;
  window_end: string;
  status: string;
  points: DemoForecastPoint[];
  inside: number | null;
  compared: number | null;
};

export type DemoForecastModel = {
  model_id: string;
  model_revision: string;
  created_at: string;
};

export type DemoSnapshot = {
  experiment: unknown;
  concept: unknown;
  series: DemoSeriesPoint[];
  partner_points: DemoPartnerPoint[];
  coverage: DemoCoverage;
  engine_proof: DemoEngineRow[];
  associations: DemoAssociation[];
  generated_at: string;
  // Optional so snapshots taken before the forecast job still load.
  forecast_model?: DemoForecastModel;
  forecast_bands?: DemoForecastBand[];
};

export function assertDemoSnapshotSafe(payload: DemoSnapshot) {
  assertNoSpeech("demo_series", payload.series);
  assertNoSpeech("demo_partner_points", payload.partner_points);
  assertNoSpeech("demo_coverage", [payload.coverage]);
  assertNoSpeech("demo_engine_proof", payload.engine_proof);
  assertNoSpeech("demo_associations", payload.associations);
  if (payload.forecast_model) {
    assertNoSpeech("demo_forecast_model", [payload.forecast_model]);
  }
  if (payload.forecast_bands) {
    assertNoSpeech("demo_forecast_bands", payload.forecast_bands);
  }
}

export const DEMO_MEASURES = [
  { id: "recall.accuracy", label: "Recall accuracy" },
  { id: "recall.richness", label: "Recall richness" },
  { id: "recall.false_alarm", label: "False alarms" },
  { id: "whoop.sleep_asleep_min", label: "Sleep minutes" },
  { id: "whoop.hrv_rmssd_ms", label: "HRV" },
] as const;
