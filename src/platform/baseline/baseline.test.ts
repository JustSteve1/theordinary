import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import type { ForecastRow } from "@/src/features/demo/bands";
import { buildBaselinePayload, HOME_MEASURES } from "@/src/platform/baseline/snapshot";

function forecast(patch: Partial<ForecastRow> = {}): ForecastRow {
  return {
    run_id: "run-1",
    created_at: "2026-10-22T10:00:00.000Z",
    model_id: "amazon/chronos-2",
    model_revision: "29ec3766abcdef",
    feature_id: "recall.accuracy",
    history_segment: "full",
    history_days: 21,
    window_start: "2026-10-16",
    window_end: "2026-10-22",
    target_date: "2026-10-16",
    q10: 40,
    q50: 55,
    q90: 70,
    status: "ok",
    ...patch,
  };
}

test("the baseline payload keeps only Home measures, counts days inside the band, and holds no speech", () => {
  const forecasts = [
    forecast(),
    forecast({ target_date: "2026-10-17" }),
    forecast({ feature_id: "recall.richness", q10: 20, q50: 30, q90: 40 }),
    forecast({ feature_id: "whoop.hrv_rmssd_ms", q10: 20, q50: 30, q90: 40 }),
  ];
  const features = [
    { date: "2026-10-17", measure_id: "recall.accuracy", value_number: 60 },
    { date: "2026-10-16", measure_id: "recall.accuracy", value_number: 90 },
    { date: "2026-10-16", measure_id: "recall.richness", value_number: 35 },
    { date: "2026-10-16", measure_id: "whoop.hrv_rmssd_ms", value_number: 44 },
  ];
  const payload = buildBaselinePayload(forecasts, features, new Date("2026-10-22T11:00:00Z"));
  assert.ok(payload);
  assert.equal(payload.model.model_id, "amazon/chronos-2");
  assert.deepEqual(
    payload.bands.map((band) => band.measure_id),
    [...HOME_MEASURES],
  );
  assert.deepEqual(
    payload.series.map((point) => `${point.date} ${point.measure_id}`),
    ["2026-10-16 recall.accuracy", "2026-10-16 recall.richness", "2026-10-17 recall.accuracy"],
  );
  const accuracy = payload.bands.find((band) => band.measure_id === "recall.accuracy");
  assert.equal(accuracy?.compared, 2);
  assert.equal(accuracy?.inside, 1);
  assert.equal(accuracy?.segment, "full");
  const text = JSON.stringify(payload);
  assert.ok(!text.includes("whoop.hrv_rmssd_ms"));
  assert.ok(!/talk|narrative|answer|transcript/i.test(text));
  assert.equal(payload.generated_at, "2026-10-22T11:00:00.000Z");
});

test("no forecast rows means no payload", () => {
  assert.equal(buildBaselinePayload([], []), null);
});

test("the schema declares baseline snapshots keyed by member and run", () => {
  const schema = readFileSync("src/platform/db.ts", "utf8");
  assert.match(schema, /create table if not exists baseline_snapshots/);
  assert.match(schema, /unique \(user_id, run_id\)/);
});

test("the Warehouse workflow runs the forecast job, the forecast tag, then the snapshot route", () => {
  const workflow = readFileSync(".github/workflows/warehouse.yml", "utf8");
  const job = workflow.indexOf("gcloud run jobs execute ordinary-forecast");
  const tag = workflow.indexOf("--tags forecast");
  const snapshot = workflow.indexOf("/api/cron/baseline-snapshot");
  assert.ok(job > 0 && tag > job && snapshot > tag);
  assert.match(workflow, /--region europe-west2/);
  assert.match(workflow, /FORECAST_JOB_ENABLED == 'true'/);
});
