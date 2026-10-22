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

function renderDemo(snapshot: DemoSnapshot) {
  return renderToStaticMarkup(createElement(DemoView, { snapshot, score: null }));
}

function panelFor(html: string, label: string) {
  const start = html.indexOf(`>${label}<`);
  assert.ok(start >= 0, `${label} panel is rendered`);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

test("full band renders solid fill, dashed median, window tick and label", () => {
  const html = renderDemo(demoSnapshotFixture);
  const panel = panelFor(html, "HRV");
  assert.match(panel, /data-band="full"/);
  assert.match(panel, /fill-opacity="0\.25"/);
  assert.match(panel, /data-band-median=""[^>]*stroke-dasharray="4 3"/);
  assert.match(panel, /data-window-start=""/);
  assert.match(panel, /Baseline expectation, no experiment yet/);
  assert.match(panel, /Forecast by Chronos-2 from 21 days before\. Not a measured effect\./);
  assert.match(panel, /Actual inside the expected range on 7 of 7 days\./);
  // Band first, actual line last so the blue line sits on top.
  assert.ok(panel.indexOf('data-band="full"') < panel.indexOf('stroke="#0a84ff"'));
  assert.ok(panel.indexOf("data-window-start") < panel.indexOf('stroke="#0a84ff"'));
});

test("limited band renders lighter dashed outline and early-estimate caption", () => {
  const html = renderDemo(demoSnapshotFixture);
  const panel = panelFor(html, "Recall accuracy");
  assert.match(panel, /data-band="limited"/);
  assert.match(panel, /fill-opacity="0\.12"/);
  assert.match(panel, /data-band="limited"[^>]*stroke-dasharray="3 3"/);
  assert.match(panel, /Baseline expectation, no experiment yet/);
  assert.match(panel, /Early estimate: only 6 days of history, so the range is less certain\. Not a measured effect\./);
  assert.match(panel, /Actual inside the range on 5 of 5 days\./);
});

test("insufficient band draws nothing and explains why", () => {
  const html = renderDemo(demoSnapshotFixture);
  const panel = panelFor(html, "Sleep minutes");
  assert.doesNotMatch(panel, /data-band=/);
  assert.doesNotMatch(panel, /data-window-start/);
  assert.match(panel, /Not enough history yet for a baseline \(3 days\)\./);
  assert.doesNotMatch(panel, /Baseline expectation/);
});

test("a chart without a band is unchanged", () => {
  const html = renderDemo(demoSnapshotFixture);
  const panel = panelFor(html, "False alarms");
  assert.doesNotMatch(panel, /data-band/);
  assert.doesNotMatch(panel, /Baseline expectation|Not enough history/);
  const legacy = JSON.parse(JSON.stringify({ ...demoSnapshotFixture, forecast_bands: undefined })) as DemoSnapshot;
  const legacyPanel = panelFor(renderDemo(legacy), "False alarms");
  assert.equal(legacyPanel, panel);
});

test("legend and model line appear only with bands", () => {
  const html = renderDemo(demoSnapshotFixture);
  assert.match(html, /Expected range without any experiment/);
  assert.match(html, /What actually happened/);
  assert.match(html, /Model: amazon\/chronos-2 \(29ec376\), run /);
});

test("the y-scale includes the band so it never clips", () => {
  const snapshot = JSON.parse(JSON.stringify(demoSnapshotFixture)) as DemoSnapshot;
  const band = snapshot.forecast_bands!.find((row) => row.measure_id === "whoop.hrv_rmssd_ms")!;
  band.points = band.points.map((point) => ({ ...point, q10: 10, q90: 90 }));
  const panel = panelFor(renderDemo(snapshot), "HRV");
  const d = /data-band="full" d="([^"]+)"/.exec(panel)?.[1] ?? "";
  const ys = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((match) => Number(match[1]));
  assert.ok(ys.length > 0);
  // Sparkline height is 72 with an 8px inset: q90 at the top edge, q10 at the bottom.
  assert.ok(Math.min(...ys) >= 8 - 0.1 && Math.min(...ys) <= 8.1, `top ${Math.min(...ys)}`);
  assert.ok(Math.max(...ys) >= 63.9 && Math.max(...ys) <= 64.1, `bottom ${Math.max(...ys)}`);
  const line = /stroke="#0a84ff"/.test(panel);
  assert.ok(line);
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
