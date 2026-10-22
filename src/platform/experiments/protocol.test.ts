import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { validateExperiment, type ExperimentConfig } from "@/src/platform/experiments/config";
import { assertActivatablePath, experimentFilePath } from "@/src/platform/experiments/activate";
import { parseExperiment } from "@/src/platform/experiments/protocol/validate";

function validV1(patch: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    id: "sample",
    version: 1,
    title: "Sample",
    hypothesis: "A filled hypothesis",
    design: "micro_randomised_daily",
    decision_time_local: "08:00",
    arms: [
      { name: "control", instruction: null },
      { name: "treatment", instruction: "Take the stairs." },
    ],
    treatment_probability: 0.5,
    availability: { requires_whoop_yesterday: true, skip_dates: [] },
    primary_outcome: { feature_id: "whoop.hrv_rmssd_ms.dev", offset_days: 1, direction: "increase" },
    secondary_outcomes: [{ feature_id: "recall.accuracy", offset_days: 0, direction: "increase" }],
    min_days: 42,
    max_days: 70,
    notes: "offset 1 is next-morning recovery.",
    ...patch,
  };
}

function dryRun() {
  return JSON.parse(readFileSync("experiments/barbara-dry-run.json", "utf8"));
}

test("v1 first-experiment path is unchanged", () => {
  const draft = JSON.parse(readFileSync("experiments/first-experiment.json", "utf8"));
  assert.equal("schema_version" in draft, false);
  const refused = validateExperiment(draft);
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.ok(refused.errors.includes("hypothesis"));
    assert.ok(refused.errors.includes("arms.treatment"));
  }
  const filled = parseExperiment(validV1());
  assert.equal(filled.ok, true);
  if (filled.ok) {
    assert.equal(filled.kind, "v1");
  }
});

test("barbara-dry-run validates as monitoring v2", () => {
  const parsed = parseExperiment(dryRun());
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.kind, "monitoring");
    assert.equal(parsed.config.id, "barbara-dry-run");
  }
});

test("v2 monitoring rejects bad timepoints, categories, TODOs and designs", () => {
  const unknown = dryRun();
  unknown.partner_measures[0].timepoints = ["baseline", "missing"];
  const unknownResult = parseExperiment(unknown);
  assert.equal(unknownResult.ok, false);
  if (!unknownResult.ok) {
    assert.ok(unknownResult.errors.includes("partner_measures.timepoints"));
  }

  const outOfRange = dryRun();
  outOfRange.schedule.timepoints[1].day = 40;
  const rangeResult = parseExperiment(outOfRange);
  assert.equal(rangeResult.ok, false);
  if (!rangeResult.ok) {
    assert.ok(rangeResult.errors.includes("schedule.timepoints.day"));
  }

  const empty = dryRun();
  empty.partner_measures[1].categories = [];
  const emptyResult = parseExperiment(empty);
  assert.equal(emptyResult.ok, false);
  if (!emptyResult.ok) {
    assert.ok(emptyResult.errors.includes("partner_measures.categories"));
  }

  const todo = dryRun();
  todo.partner.name = "TODO";
  const todoResult = parseExperiment(todo);
  assert.equal(todoResult.ok, false);
  if (!todoResult.ok) {
    assert.ok(todoResult.errors.includes("TODO"));
  }

  const unsupported = dryRun();
  unsupported.design = "parallel_rct";
  const unsupportedResult = parseExperiment(unsupported);
  assert.equal(unsupportedResult.ok, false);
  if (!unsupportedResult.ok) {
    assert.ok(unsupportedResult.errors.includes("not supported yet"));
  }
});

test("activation refuses concept files", () => {
  assert.doesNotThrow(() => {
    const path = experimentFilePath("barbara-dry-run");
    assertActivatablePath(path);
  });
  assert.throws(() => experimentFilePath("concepts/spotify-mood-lift"), /Invalid experiment id/);
  assert.throws(
    () => assertActivatablePath("experiments/concepts/spotify-mood-lift.json"),
    /Concept files cannot be activated/,
  );
});
