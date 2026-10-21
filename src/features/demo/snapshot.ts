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

export type DemoSnapshot = {
  experiment: unknown;
  concept: unknown;
  series: DemoSeriesPoint[];
  partner_points: DemoPartnerPoint[];
  coverage: DemoCoverage;
  engine_proof: DemoEngineRow[];
  associations: DemoAssociation[];
  generated_at: string;
};

export function assertDemoSnapshotSafe(payload: DemoSnapshot) {
  assertNoSpeech("demo_series", payload.series);
  assertNoSpeech("demo_partner_points", payload.partner_points);
  assertNoSpeech("demo_coverage", [payload.coverage]);
  assertNoSpeech("demo_engine_proof", payload.engine_proof);
  assertNoSpeech("demo_associations", payload.associations);
}

export const DEMO_MEASURES = [
  { id: "recall.accuracy", label: "Recall accuracy" },
  { id: "recall.richness", label: "Recall richness" },
  { id: "recall.false_alarm", label: "False alarms" },
  { id: "whoop.sleep_asleep_min", label: "Sleep minutes" },
  { id: "whoop.hrv_rmssd_ms", label: "HRV" },
] as const;
