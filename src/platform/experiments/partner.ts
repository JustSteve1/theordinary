import { createHash } from "crypto";

import type { MonitoringConfig, MonitoringPartnerMeasure } from "@/src/platform/experiments/protocol/types";

export type PartnerCsvRow = {
  line: number;
  email: string;
  measure_id: string;
  timepoint_id: string;
  value: string;
};

export type PartnerRejection = {
  line: number;
  reason: string;
};

export type PartnerLoadRow = {
  member_key: string;
  experiment_id: string;
  version: number;
  measure_id: string;
  timepoint_id: string;
  value_number: number | null;
  value_category: string | null;
  unit: string | null;
  is_synthetic: boolean;
  import_id: string;
  ingested_at: string;
};

const HEADER = ["email", "measure_id", "timepoint_id", "value"];

export function partnerImportId(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export function parsePartnerCsv(text: string): { rows: PartnerCsvRow[]; errors: PartnerRejection[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const errors: PartnerRejection[] = [];
  if (!lines.length) {
    return { rows: [], errors: [{ line: 1, reason: "empty_file" }] };
  }
  const header = lines[0].split(",").map((item) => item.trim());
  if (header.length !== HEADER.length || HEADER.some((name, index) => header[index] !== name)) {
    return { rows: [], errors: [{ line: 1, reason: "bad_header" }] };
  }
  const rows: PartnerCsvRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = lines[index].split(",").map((item) => item.trim());
    if (cells.length !== 4) {
      errors.push({ line: index + 1, reason: "bad_columns" });
      continue;
    }
    rows.push({
      line: index + 1,
      email: cells[0].toLowerCase(),
      measure_id: cells[1],
      timepoint_id: cells[2],
      value: cells[3],
    });
  }
  return { rows, errors };
}

export function assertSampleAllowed(environment: string) {
  if (environment !== "test") {
    throw new Error("Sample files are only written for test experiments.");
  }
}

export function validatePartnerRows(input: {
  rows: PartnerCsvRow[];
  config: MonitoringConfig;
  allowlistedEmail: string;
  enrolled: boolean;
  memberKey: string | null;
  importId: string;
  alreadyImported: boolean;
}): { accepted: PartnerLoadRow[]; rejected: PartnerRejection[] } {
  const rejected: PartnerRejection[] = [];
  if (input.alreadyImported) {
    return { accepted: [], rejected: [{ line: 1, reason: "duplicate_file" }] };
  }
  const measures = new Map(input.config.partner_measures.map((item) => [item.id, item]));
  const accepted: PartnerLoadRow[] = [];
  const allowlisted = input.allowlistedEmail.trim().toLowerCase();
  for (const row of input.rows) {
    if (input.config.environment === "test" && row.email !== allowlisted) {
      rejected.push({ line: row.line, reason: "email_not_allowlisted" });
      continue;
    }
    if (!input.enrolled || !input.memberKey) {
      rejected.push({ line: row.line, reason: "not_enrolled" });
      continue;
    }
    const measure = measures.get(row.measure_id);
    if (!measure) {
      rejected.push({ line: row.line, reason: "unknown_measure" });
      continue;
    }
    if (!measure.timepoints.includes(row.timepoint_id)) {
      rejected.push({ line: row.line, reason: "unknown_timepoint" });
      continue;
    }
    const parsed = parseMeasureValue(measure, row.value);
    if (!parsed.ok) {
      rejected.push({ line: row.line, reason: parsed.reason });
      continue;
    }
    accepted.push({
      member_key: input.memberKey,
      experiment_id: input.config.id,
      version: input.config.version,
      measure_id: row.measure_id,
      timepoint_id: row.timepoint_id,
      value_number: parsed.value_number,
      value_category: parsed.value_category,
      unit: measure.type === "number" ? measure.unit : null,
      is_synthetic: input.config.environment === "test",
      import_id: input.importId,
      ingested_at: new Date().toISOString(),
    });
  }
  return { accepted, rejected };
}

function parseMeasureValue(measure: MonitoringPartnerMeasure, value: string) {
  if (measure.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number) || number < measure.range[0] || number > measure.range[1]) {
      return { ok: false as const, reason: "number_out_of_range" };
    }
    return { ok: true as const, value_number: number, value_category: null };
  }
  if (!measure.categories.includes(value)) {
    return { ok: false as const, reason: "unknown_category" };
  }
  return { ok: true as const, value_number: null, value_category: value };
}

export function sampleCsv(config: MonitoringConfig, email: string) {
  assertSampleAllowed(config.environment);
  const lines = [HEADER.join(",")];
  for (const measure of config.partner_measures) {
    for (const timepoint of measure.timepoints) {
      const value = measure.type === "number" ? sampleNumber(measure.range, timepoint) : measure.categories[0];
      lines.push([email, measure.id, timepoint, String(value)].join(","));
    }
  }
  return `${lines.join("\n")}\n`;
}

function sampleNumber(range: [number, number], timepoint: string) {
  const mid = (range[0] + range[1]) / 2;
  return timepoint === "end" ? Math.min(range[1], mid + 4) : mid;
}

export function loadedRowsHaveNoEmail(rows: PartnerLoadRow[]) {
  return rows.every((row) => !JSON.stringify(row).toLowerCase().includes("email") && !Object.values(row).some((value) => typeof value === "string" && value.includes("@")));
}
