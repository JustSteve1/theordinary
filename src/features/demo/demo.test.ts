import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { canViewDemo } from "@/src/features/demo/access";
import {
  buildForecastBands,
  countBandsBySegment,
  countInside,
  forecastModelFrom,
  type ForecastRow,
} from "@/src/features/demo/bands";
import { demoSnapshotFixture } from "@/src/features/demo/fixture";
import { DemoView } from "@/src/features/demo/view";
import { assertDemoSnapshotSafe, type DemoSnapshot } from "@/src/features/demo/snapshot";
import { assertNoSpeech, SpeechFirewallError } from "@/src/platform/warehouse/firewall";

function forecastRow(overrides: Partial<ForecastRow>): ForecastRow {
  return {
    run_id: "run-1",
    created_at: "2026-10-22T08:00:00.000Z",
    model_id: "amazon/chronos-2",
    model_revision: "29ec3766d36d6f73f0696f85560a422f50e8498c",
    feature_id: "whoop.hrv_rmssd_ms",
    history_segment: "full",
    history_days: 21,
    window_start: "2026-10-15",
    window_end: "2026-10-21",
    target_date: "2026-10-15",
    q10: 38,
    q50: 42,
    q90: 46,
    status: "ok",
    ...overrides,
  };
}

test("inside/compared counts window days with an actual value", () => {
  const points = [
    { date: "2026-10-15", q10: 38, q50: 42, q90: 46 },
    { date: "2026-10-16", q10: 38, q50: 42, q90: 46 },
    { date: "2026-10-17", q10: 38, q50: 42, q90: 46 },
    { date: "2026-10-18", q10: 38, q50: 42, q90: 46 },
  ];
  const actual = [
    { date: "2026-10-15", value_number: 40 },
    { date: "2026-10-16", value_number: 50 },
    { date: "2026-10-17", value_number: null },
    { date: "2026-10-18", value_number: 46 },
    { date: "2026-10-19", value_number: 10 },
  ];
  assert.deepEqual(countInside(points, actual), { inside: 2, compared: 3 });
  assert.deepEqual(countInside([], actual), { inside: null, compared: null });
  assert.deepEqual(countInside(points, []), { inside: 0, compared: 0 });
});

test("forecast bands are built per measure with segment and model info", () => {
  const rows: ForecastRow[] = [
    forecastRow({ target_date: "2026-10-15", q10: 38, q50: 42, q90: 46 }),
    forecastRow({ target_date: "2026-10-16", q10: 39, q50: 43, q90: 47 }),
    forecastRow({
      feature_id: "recall.accuracy",
      history_segment: "limited",
      history_days: 6,
      target_date: "2026-10-15",
      q10: 60,
      q50: 70,
      q90: 80,
    }),
    forecastRow({
      feature_id: "recall.richness",
      history_segment: "insufficient",
      history_days: 2,
      target_date: null,
      q10: null,
      q50: null,
      q90: null,
      status: "insufficient_history",
    }),
  ];
  const series = [
    { date: "2026-10-15", measure_id: "whoop.hrv_rmssd_ms", value_number: 41, study_day: 24 },
    { date: "2026-10-16", measure_id: "whoop.hrv_rmssd_ms", value_number: 55, study_day: 25 },
    { date: "2026-10-15", measure_id: "recall.accuracy", value_number: 65, study_day: 24 },
  ];
  const bands = buildForecastBands(rows, series);
  assert.deepEqual(
    bands.map((band) => [band.measure_id, band.segment, band.points.length, band.inside, band.compared]),
    [
      ["recall.accuracy", "limited", 1, 1, 1],
      ["recall.richness", "insufficient", 0, null, null],
      ["whoop.hrv_rmssd_ms", "full", 2, 1, 2],
    ],
  );
  assert.equal(bands[1].status, "insufficient_history");
  assert.equal(bands[2].window_start, "2026-10-15");
  assert.deepEqual(countBandsBySegment(bands), { full: 1, limited: 1, insufficient: 1 });
  assert.deepEqual(forecastModelFrom(rows), {
    model_id: "amazon/chronos-2",
    model_revision: "29ec3766d36d6f73f0696f85560a422f50e8498c",
    created_at: "2026-10-22T08:00:00.000Z",
  });
  assert.equal(forecastModelFrom([]), undefined);
  assert.doesNotThrow(() =>
    assertDemoSnapshotSafe({
      ...demoSnapshotFixture,
      forecast_model: forecastModelFrom(rows),
      forecast_bands: bands,
    }),
  );
});

test("an older snapshot without bands still validates and renders", () => {
  const legacy = { ...demoSnapshotFixture };
  delete legacy.forecast_model;
  delete legacy.forecast_bands;
  const parsed = JSON.parse(JSON.stringify(legacy)) as DemoSnapshot;
  assert.equal(parsed.forecast_bands, undefined);
  assert.doesNotThrow(() => assertDemoSnapshotSafe(parsed));
  const html = renderToStaticMarkup(createElement(DemoView, { snapshot: parsed, score: null }));
  assert.match(html, /30 days of real life/);
  assert.doesNotMatch(html, /Baseline expectation/);
  assert.doesNotMatch(html, /Model: amazon\/chronos-2/);
});

test("demo access allows USER1, preview, and local snapshot file", () => {
  assert.equal(
    canViewDemo({ email: "user1@example.com", preview: false, allowlistedEmail: "user1@example.com" }),
    true,
  );
  assert.equal(
    canViewDemo({ email: "other@example.com", preview: false, allowlistedEmail: "user1@example.com" }),
    false,
  );
  assert.equal(
    canViewDemo({ email: "other@example.com", preview: true, allowlistedEmail: "user1@example.com" }),
    true,
  );
  assert.equal(
    canViewDemo({
      email: null,
      preview: false,
      snapshotFile: true,
      nodeEnv: "development",
    }),
    true,
  );
  assert.equal(
    canViewDemo({
      email: null,
      preview: false,
      snapshotFile: true,
      nodeEnv: "production",
    }),
    false,
  );
});

test("snapshot data sections pass the firewall", () => {
  assert.doesNotThrow(() => assertDemoSnapshotSafe(demoSnapshotFixture));
  assert.throws(
    () => assertNoSpeech("demo_series", [{ text: "speech" }]),
    SpeechFirewallError,
  );
});

test("demo page renders from the fixture file", () => {
  const html = renderToStaticMarkup(
    createElement(DemoView, {
      snapshot: demoSnapshotFixture,
      score: {
        accuracy: 70,
        richness: 64,
        recordedAt: "2026-10-21T09:00:00.000Z",
        dimensions: [
          { id: "people", label: "People", display: 67 },
          { id: "places", label: "Places", display: 60 },
        ],
      },
    }),
  );
  assert.match(html, /An experiment is a JSON/);
  assert.match(html, /Latest check-in/);
  assert.match(html, /30 days of real life/);
  assert.match(html, /Coverage/);
  assert.match(html, /The engine finds/);
  assert.match(html, /What production adds/);
  assert.match(html, /Synthetic partner data/);
  assert.match(html, /Association, not cause/);
  assert.match(html, /Accuracy 70/);
});
