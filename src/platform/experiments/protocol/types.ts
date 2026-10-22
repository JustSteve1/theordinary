import type { ExperimentConfig } from "@/src/platform/experiments/config";

export type MonitoringPartner = {
  id: string;
  name: string;
  role: string;
  receives: string[];
  never_receives: string[];
};

export type MonitoringTimepoint = {
  id: string;
  day: number;
};

export type MonitoringNumberMeasure = {
  id: string;
  type: "number";
  unit: string;
  range: [number, number];
  timepoints: string[];
};

export type MonitoringCategoryMeasure = {
  id: string;
  type: "category";
  categories: string[];
  timepoints: string[];
};

export type MonitoringPartnerMeasure = MonitoringNumberMeasure | MonitoringCategoryMeasure;

export type MonitoringConfig = {
  schema_version: 2;
  id: string;
  version: number;
  status: "draft" | "active" | "ended";
  environment: "test" | "production";
  title: string;
  partner: MonitoringPartner;
  design: "monitoring_validation";
  duration_days: number;
  schedule: {
    daily_measures: string[];
    timepoints: MonitoringTimepoint[];
  };
  partner_measures: MonitoringPartnerMeasure[];
};

export type ParsedExperiment =
  | { ok: true; kind: "v1"; config: ExperimentConfig }
  | { ok: true; kind: "monitoring"; config: MonitoringConfig }
  | { ok: false; errors: string[] };
