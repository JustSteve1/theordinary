import { validateExperiment } from "@/src/platform/experiments/config";
import { designInfo } from "@/src/platform/experiments/protocol/designs";
import type {
  MonitoringCategoryMeasure,
  MonitoringConfig,
  MonitoringNumberMeasure,
  MonitoringPartnerMeasure,
  ParsedExperiment,
} from "@/src/platform/experiments/protocol/types";

export function parseExperiment(value: unknown): ParsedExperiment {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (row.schema_version === undefined || row.schema_version === null) {
    const v1 = validateExperiment(value);
    if (!v1.ok) {
      return v1;
    }
    return { ok: true, kind: "v1", config: v1.config };
  }
  if (row.schema_version !== 2) {
    return { ok: false, errors: ["schema_version"] };
  }
  return validateMonitoring(row);
}

function validateMonitoring(row: Record<string, unknown>): ParsedExperiment {
  if (containsTodo(row)) {
    return { ok: false, errors: ["TODO"] };
  }
  const info = designInfo(row.design);
  if (!info || !info.supported || row.design !== "monitoring_validation") {
    return { ok: false, errors: ["not supported yet"] };
  }

  const errors: string[] = [];
  if (typeof row.id !== "string" || !row.id) errors.push("id");
  if (typeof row.version !== "number") errors.push("version");
  if (row.status !== "draft" && row.status !== "active" && row.status !== "ended") {
    errors.push("status");
  }
  if (row.environment !== "test" && row.environment !== "production") {
    errors.push("environment");
  }
  if (typeof row.title !== "string" || !row.title) errors.push("title");

  const partner = row.partner && typeof row.partner === "object" ? (row.partner as Record<string, unknown>) : {};
  if (typeof partner.id !== "string" || !partner.id) errors.push("partner.id");
  if (typeof partner.name !== "string" || !partner.name) errors.push("partner.name");
  if (typeof partner.role !== "string" || !partner.role) errors.push("partner.role");
  if (!stringList(partner.receives)) errors.push("partner.receives");
  if (!stringList(partner.never_receives)) errors.push("partner.never_receives");

  if (typeof row.duration_days !== "number" || row.duration_days < 1 || row.duration_days > 120) {
    errors.push("duration_days");
  }

  const schedule = row.schedule && typeof row.schedule === "object" ? (row.schedule as Record<string, unknown>) : {};
  const daily = Array.isArray(schedule.daily_measures) ? schedule.daily_measures : [];
  if (!daily.length || daily.some((item) => typeof item !== "string" || !item)) {
    errors.push("schedule.daily_measures");
  }
  const timepoints = Array.isArray(schedule.timepoints) ? schedule.timepoints : [];
  const timepointIds = new Set<string>();
  if (!timepoints.length) {
    errors.push("schedule.timepoints");
  }
  for (const item of timepoints) {
    const point = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    if (typeof point.id !== "string" || !point.id) {
      errors.push("schedule.timepoints.id");
      continue;
    }
    timepointIds.add(point.id);
    if (
      typeof point.day !== "number" ||
      !Number.isInteger(point.day) ||
      point.day < 0 ||
      (typeof row.duration_days === "number" && point.day > row.duration_days)
    ) {
      errors.push("schedule.timepoints.day");
    }
  }

  const measures = Array.isArray(row.partner_measures) ? row.partner_measures : [];
  if (!measures.length) {
    errors.push("partner_measures");
  }
  for (const item of measures) {
    const measure = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    if (typeof measure.id !== "string" || !measure.id) errors.push("partner_measures.id");
    const refs = Array.isArray(measure.timepoints) ? measure.timepoints : [];
    if (!refs.length || refs.some((ref) => typeof ref !== "string" || !timepointIds.has(ref))) {
      errors.push("partner_measures.timepoints");
    }
    if (measure.type === "number") {
      if (typeof measure.unit !== "string" || !measure.unit) errors.push("partner_measures.unit");
      const range = Array.isArray(measure.range) ? measure.range : [];
      if (
        range.length !== 2 ||
        typeof range[0] !== "number" ||
        typeof range[1] !== "number" ||
        range[0] > range[1]
      ) {
        errors.push("partner_measures.range");
      }
    } else if (measure.type === "category") {
      const categories = Array.isArray(measure.categories) ? measure.categories : [];
      if (!categories.length || categories.some((entry) => typeof entry !== "string" || !entry)) {
        errors.push("partner_measures.categories");
      }
    } else {
      errors.push("partner_measures.type");
    }
  }

  if (errors.length) {
    return { ok: false, errors: [...new Set(errors)] };
  }
  return { ok: true, kind: "monitoring", config: row as unknown as MonitoringConfig };
}

export function containsTodo(value: unknown): boolean {
  if (value === "TODO") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(containsTodo);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(containsTodo);
  }
  return false;
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

export function isNumberMeasure(value: MonitoringPartnerMeasure): value is MonitoringNumberMeasure {
  return value.type === "number";
}

export function isCategoryMeasure(value: MonitoringPartnerMeasure): value is MonitoringCategoryMeasure {
  return value.type === "category";
}
