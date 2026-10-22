import { createRequire } from "node:module";

import { parseExperiment } from "@/src/platform/experiments/protocol/validate";
import type { MonitoringConfig } from "@/src/platform/experiments/protocol/types";
import type { ExperimentConfig } from "@/src/platform/experiments/config";

const require = createRequire(import.meta.url);
const { FEATURES } = require("../../../warehouse/dataform/includes/registry.js") as {
  FEATURES: { id: string }[];
};

export function experimentFilePath(id: string) {
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new Error("Invalid experiment id.");
  }
  return `experiments/${id}.json`;
}

export function assertActivatablePath(relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("experiments/concepts/")) {
    throw new Error("Concept files cannot be activated.");
  }
}

export function parseActivateArgs(argv: string[]) {
  const id = argv[0] ?? "";
  let enrolMe = false;
  let start: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--enrol-me") {
      enrolMe = true;
      continue;
    }
    if (token === "--start") {
      start = argv[index + 1];
      index += 1;
    }
  }
  return { id, enrolMe, start };
}

export function assertStartAllowed(environment: string, start?: string) {
  if (start && environment !== "test") {
    throw new Error("--start is only allowed for test experiments.");
  }
}

export function parseStartDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("--start must be YYYY-MM-DD.");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("--start must be a real date.");
  }
  return value;
}

export function localFeatureIds() {
  return FEATURES.map((item) => item.id);
}

export function missingFeatures(ids: string[], present: Iterable<string>) {
  const allowed = new Set([...present, ...localFeatureIds()]);
  return ids.filter((id) => !allowed.has(id));
}

export function monitoringFeatureIds(config: MonitoringConfig) {
  return config.schedule.daily_measures;
}

export function v1FeatureIds(config: ExperimentConfig) {
  return [config.primary_outcome.feature_id, ...config.secondary_outcomes.map((item) => item.feature_id)];
}

export function experimentEnvironment(value: unknown) {
  if (!value || typeof value !== "object") {
    return "production";
  }
  const environment = (value as { environment?: unknown }).environment;
  return environment === "test" || environment === "production" ? environment : "production";
}

export function experimentSchemaVersion(value: unknown) {
  if (!value || typeof value !== "object") {
    return 1;
  }
  const version = (value as { schema_version?: unknown }).schema_version;
  return typeof version === "number" ? version : 1;
}

export function parsedOrThrow(value: unknown) {
  const parsed = parseExperiment(value);
  if (!parsed.ok) {
    throw new Error(`Refusing to activate: ${parsed.errors.join(", ")}`);
  }
  return parsed;
}
