import type { Table, TableField, TableMetadata } from "@google-cloud/bigquery";

import { warehouse, warehouseEnabled } from "@/src/platform/warehouse/client";

type Column = { name: string; type: string; mode?: "REQUIRED" | "NULLABLE" };

const whoop: Column[] = [
  { name: "member_key", type: "STRING", mode: "REQUIRED" },
  { name: "record_id", type: "STRING", mode: "REQUIRED" },
  { name: "record_updated_at", type: "TIMESTAMP" },
  { name: "start_at", type: "TIMESTAMP" },
  { name: "end_at", type: "TIMESTAMP" },
  { name: "timezone_offset", type: "STRING" },
  { name: "score_state", type: "STRING" },
  { name: "deleted", type: "BOOL" },
  { name: "payload", type: "JSON" },
  { name: "source", type: "STRING", mode: "REQUIRED" },
  { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
];

export const TABLE_SCHEMAS: Record<string, { dataset: string; columns: Column[] }> = {
  whoop_cycle: { dataset: "ordinary_raw", columns: whoop },
  whoop_recovery: { dataset: "ordinary_raw", columns: whoop },
  whoop_sleep: { dataset: "ordinary_raw", columns: whoop },
  whoop_workout: { dataset: "ordinary_raw", columns: whoop },
  app_members: {
    dataset: "ordinary_raw",
    columns: [
      { name: "member_key", type: "STRING", mode: "REQUIRED" },
      { name: "time_zone", type: "STRING" },
      { name: "onboarded_at", type: "TIMESTAMP" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
  app_consents: {
    dataset: "ordinary_raw",
    columns: [
      { name: "member_key", type: "STRING", mode: "REQUIRED" },
      { name: "health_accepted_at", type: "TIMESTAMP" },
      { name: "health_withdrawn", type: "BOOL" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
  app_checkins: {
    dataset: "ordinary_raw",
    columns: [
      { name: "member_key", type: "STRING", mode: "REQUIRED" },
      { name: "checkin_id", type: "STRING", mode: "REQUIRED" },
      { name: "session_id", type: "STRING" },
      { name: "recorded_at", type: "TIMESTAMP" },
      { name: "target_date", type: "DATE" },
      { name: "input_mode", type: "STRING" },
      { name: "asr_confidence", type: "FLOAT64" },
      { name: "prior_non_empty", type: "INT64" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
  app_score_runs: {
    dataset: "ordinary_raw",
    columns: [
      { name: "member_key", type: "STRING", mode: "REQUIRED" },
      { name: "checkin_id", type: "STRING", mode: "REQUIRED" },
      { name: "scorer_version", type: "STRING" },
      { name: "config_hash", type: "STRING" },
      { name: "matcher_tier", type: "STRING" },
      { name: "computed_at", type: "TIMESTAMP" },
      { name: "accuracy", type: "FLOAT64" },
      { name: "richness", type: "FLOAT64" },
      { name: "recall", type: "FLOAT64" },
      { name: "core", type: "FLOAT64" },
      { name: "metric_detail", type: "FLOAT64" },
      { name: "intrusion", type: "FLOAT64" },
      { name: "recognition_hit", type: "FLOAT64" },
      { name: "recognition_false_alarm", type: "FLOAT64" },
      { name: "internal_details", type: "FLOAT64" },
      { name: "external_details", type: "FLOAT64" },
      { name: "abstained", type: "FLOAT64" },
      { name: "specificity_ratio", type: "FLOAT64" },
      { name: "dim_people_level", type: "FLOAT64" },
      { name: "dim_places_level", type: "FLOAT64" },
      { name: "dim_conversations_level", type: "FLOAT64" },
      { name: "dim_decisions_level", type: "FLOAT64" },
      { name: "flag_empty_talk", type: "BOOL" },
      { name: "flag_no_bee_facts", type: "BOOL" },
      { name: "flag_all_abstained", type: "BOOL" },
      { name: "flag_low_asr", type: "BOOL" },
      { name: "flag_practice", type: "BOOL" },
      { name: "lag_days", type: "FLOAT64" },
      { name: "lag_band", type: "STRING" },
      { name: "practice", type: "BOOL" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
  app_recall_sessions: {
    dataset: "ordinary_raw",
    columns: [
      { name: "member_key", type: "STRING", mode: "REQUIRED" },
      { name: "session_id", type: "STRING", mode: "REQUIRED" },
      { name: "session_date", type: "DATE" },
      { name: "recorded_at", type: "TIMESTAMP" },
      { name: "aborted", type: "BOOL" },
      { name: "short", type: "BOOL" },
      { name: "practice", type: "BOOL" },
      { name: "duration_ms", type: "INT64" },
      { name: "poor_sleep", type: "BOOL" },
      { name: "unwell_or_alcohol", type: "BOOL" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
  bee_activity: {
    dataset: "ordinary_raw",
    columns: [
      { name: "member_key", type: "STRING", mode: "REQUIRED" },
      { name: "item_id", type: "STRING", mode: "REQUIRED" },
      { name: "kind", type: "STRING" },
      { name: "start_at", type: "TIMESTAMP" },
      { name: "end_at", type: "TIMESTAMP" },
      { name: "duration_s", type: "FLOAT64" },
      { name: "is_ordinary_echo", type: "BOOL" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
  bee_daily: {
    dataset: "ordinary_raw",
    columns: [
      { name: "member_key", type: "STRING", mode: "REQUIRED" },
      { name: "day", type: "DATE" },
      { name: "has_daily_summary", type: "BOOL" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
  experiments: {
    dataset: "ordinary_experiments",
    columns: [
      { name: "experiment_id", type: "STRING", mode: "REQUIRED" },
      { name: "version", type: "INT64", mode: "REQUIRED" },
      { name: "status", type: "STRING" },
      { name: "config_hash", type: "STRING" },
      { name: "design", type: "STRING" },
      { name: "schema_version", type: "INT64" },
      { name: "environment", type: "STRING" },
      { name: "partner_id", type: "STRING" },
      { name: "duration_days", type: "INT64" },
      { name: "daily_measures", type: "JSON" },
      { name: "timepoints", type: "JSON" },
      { name: "partner_measures", type: "JSON" },
      { name: "treatment_probability", type: "FLOAT64" },
      { name: "primary_feature_id", type: "STRING" },
      { name: "primary_offset_days", type: "INT64" },
      { name: "primary_direction", type: "STRING" },
      { name: "outcomes", type: "JSON" },
      { name: "activated_at", type: "TIMESTAMP" },
      { name: "ended_at", type: "TIMESTAMP" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
  experiment_enrolments: {
    dataset: "ordinary_experiments",
    columns: [
      { name: "experiment_id", type: "STRING", mode: "REQUIRED" },
      { name: "version", type: "INT64", mode: "REQUIRED" },
      { name: "member_key", type: "STRING", mode: "REQUIRED" },
      { name: "enrolled_at", type: "TIMESTAMP" },
      { name: "left_at", type: "TIMESTAMP" },
      { name: "study_start", type: "DATE" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
  partner_measures: {
    dataset: "ordinary_raw",
    columns: [
      { name: "member_key", type: "STRING", mode: "REQUIRED" },
      { name: "experiment_id", type: "STRING", mode: "REQUIRED" },
      { name: "version", type: "INT64", mode: "REQUIRED" },
      { name: "measure_id", type: "STRING", mode: "REQUIRED" },
      { name: "timepoint_id", type: "STRING", mode: "REQUIRED" },
      { name: "value_number", type: "FLOAT64" },
      { name: "value_category", type: "STRING" },
      { name: "unit", type: "STRING" },
      { name: "is_synthetic", type: "BOOL" },
      { name: "import_id", type: "STRING" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
  decision_points: {
    dataset: "ordinary_experiments",
    columns: [
      { name: "decision_id", type: "STRING", mode: "REQUIRED" },
      { name: "experiment_id", type: "STRING", mode: "REQUIRED" },
      { name: "version", type: "INT64", mode: "REQUIRED" },
      { name: "member_key", type: "STRING", mode: "REQUIRED" },
      { name: "decision_date", type: "DATE" },
      { name: "decided_at", type: "TIMESTAMP" },
      { name: "available", type: "BOOL" },
      { name: "unavailable_reason", type: "STRING" },
      { name: "arm", type: "STRING" },
      { name: "probability", type: "FLOAT64" },
      { name: "rand_u", type: "FLOAT64" },
      { name: "delivered_at", type: "TIMESTAMP" },
      { name: "channel", type: "STRING" },
      { name: "response", type: "STRING" },
      { name: "responded_at", type: "TIMESTAMP" },
      { name: "ingested_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  },
};

export function tablesFor(dataset: string) {
  return Object.entries(TABLE_SCHEMAS)
    .filter(([, table]) => table.dataset === dataset)
    .map(([name]) => name);
}

export async function ensureTables() {
  if (!warehouseEnabled()) {
    console.info(JSON.stringify({ warehouse: "skipped", reason: "not configured" }));
    return [];
  }
  const bq = await warehouse();
  const created: string[] = [];
  for (const [name, table] of Object.entries(TABLE_SCHEMAS)) {
    const destination = bq.dataset(table.dataset).table(name);
    const [exists] = await destination.exists();
    if (exists) {
      const added = await ensureColumns(destination, table.columns);
      created.push(...added.map((column) => `${table.dataset}.${name}.${column}`));
      continue;
    }
    const metadata: TableMetadata = {
      schema: { fields: table.columns as TableField[] },
      timePartitioning: { type: "DAY", field: "ingested_at" },
    };
    if (table.columns.some((column) => column.name === "member_key")) {
      metadata.clustering = { fields: ["member_key"] };
    }
    await bq.dataset(table.dataset).createTable(name, metadata);
    created.push(`${table.dataset}.${name}`);
  }
  return created;
}

async function ensureColumns(destination: Table, columns: Column[]) {
  const [meta] = await destination.getMetadata();
  const have = new Set((meta.schema?.fields ?? []).map((field: TableField) => field.name));
  const extra = columns.filter((column) => !have.has(column.name));
  if (!extra.length) {
    return [];
  }
  meta.schema = {
    fields: [...(meta.schema?.fields ?? []), ...(extra as TableField[])],
  };
  await destination.setMetadata(meta);
  return extra.map((column) => column.name);
}
