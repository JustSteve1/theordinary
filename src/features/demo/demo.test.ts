import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { canViewDemo } from "@/src/features/demo/access";
import { demoSnapshotFixture } from "@/src/features/demo/fixture";
import { DemoView } from "@/src/features/demo/view";
import { assertDemoSnapshotSafe } from "@/src/features/demo/snapshot";
import { assertNoSpeech, SpeechFirewallError } from "@/src/platform/warehouse/firewall";

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
