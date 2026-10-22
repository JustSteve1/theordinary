import { createHash } from "crypto";

export type Outcome = {
  feature_id: string;
  offset_days: number;
  direction: "increase" | "decrease";
};

export type ExperimentConfig = {
  id: string;
  version: number;
  title: string;
  hypothesis: string;
  design: "micro_randomised_daily";
  decision_time_local: string;
  arms: [
    { name: "control"; instruction: null },
    { name: "treatment"; instruction: string },
  ];
  treatment_probability: number;
  availability: { requires_whoop_yesterday: boolean; skip_dates: string[] };
  primary_outcome: Outcome;
  secondary_outcomes: Outcome[];
  min_days: number;
  max_days: number;
  notes: string;
};

export function validateExperiment(value: unknown): { ok: true; config: ExperimentConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (typeof row.id !== "string" || !row.id) errors.push("id");
  if (typeof row.version !== "number") errors.push("version");
  if (typeof row.title !== "string") errors.push("title");
  if (row.hypothesis === "TODO" || typeof row.hypothesis !== "string" || !row.hypothesis) {
    errors.push("hypothesis");
  }
  if (row.design !== "micro_randomised_daily") errors.push("design");
  if (typeof row.decision_time_local !== "string" || !/^\d{2}:\d{2}$/.test(row.decision_time_local)) {
    errors.push("decision_time_local");
  }
  const arms = Array.isArray(row.arms) ? row.arms : [];
  const control = arms[0] as Record<string, unknown> | undefined;
  const treatment = arms[1] as Record<string, unknown> | undefined;
  if (arms.length !== 2 || control?.name !== "control" || control.instruction !== null) {
    errors.push("arms.control");
  }
  if (treatment?.name !== "treatment" || treatment.instruction === "TODO" || typeof treatment?.instruction !== "string" || !treatment.instruction) {
    errors.push("arms.treatment");
  }
  const probability = row.treatment_probability;
  if (typeof probability !== "number" || probability < 0.1 || probability > 0.9) {
    errors.push("treatment_probability");
  }
  const availability = row.availability as Record<string, unknown> | undefined;
  if (!availability || typeof availability.requires_whoop_yesterday !== "boolean" || !Array.isArray(availability.skip_dates)) {
    errors.push("availability");
  }
  if (!validOutcome(row.primary_outcome)) errors.push("primary_outcome");
  if (!Array.isArray(row.secondary_outcomes) || row.secondary_outcomes.some((item) => !validOutcome(item))) {
    errors.push("secondary_outcomes");
  }
  if (typeof row.min_days !== "number" || typeof row.max_days !== "number" || row.min_days > row.max_days) {
    errors.push("days");
  }
  if (typeof row.notes !== "string") errors.push("notes");
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, config: value as ExperimentConfig };
}

function validOutcome(value: unknown): value is Outcome {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.feature_id === "string" &&
    row.feature_id.length > 0 &&
    typeof row.offset_days === "number" &&
    (row.direction === "increase" || row.direction === "decrease")
  );
}

export function configHash(config: object) {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}
