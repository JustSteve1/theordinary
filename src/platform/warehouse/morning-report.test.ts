import assert from "node:assert/strict";
import test from "node:test";

import { morningReport, type MorningSnapshot } from "@/src/platform/warehouse/morning-report";

const snapshot: MorningSnapshot = {
  generatedAt: new Date("2026-10-23T05:40:00Z"),
  whoopConnected: true,
  whoopExpiresAt: new Date("2026-10-23T05:45:00Z"),
  whoopLastSuccessAt: new Date("2026-10-21T03:29:00Z"),
  whoopLastError: null,
  streams: [
    {
      stream: "app_checkins",
      lastSuccessAt: new Date("2026-10-22T03:35:00Z"),
      lastError: null,
    },
    {
      stream: "bee",
      lastSuccessAt: new Date("2026-10-22T03:36:00Z"),
      lastError: "Bee token was not accepted.",
    },
  ],
  checkins: [
    {
      targetDate: "2026-10-21",
      count: 1,
      recordedAt: new Date("2026-10-22T21:01:00Z"),
    },
  ],
  sessions: [{ date: "2026-10-22", count: 1 }],
  scores: [{ date: "2026-10-22", count: 2 }],
  activeExperiments: 0,
  decisions: 0,
};

test("morning report names the unfinished jobs and the WHOOP grant", () => {
  const report = morningReport(snapshot);
  assert.equal(report.subject, "Morning report, 23 Oct");
  assert.match(report.text, /Written 23 Oct, 06:40 BST/);
  assert.match(report.text, /WHOOP sync at 06:45 UTC/);
  assert.match(report.text, /arrives by 05:30 London/);
  assert.match(report.text, /Connected\. Refresh token is stored\./);
  assert.match(report.text, /No sync error is stored/);
  assert.match(report.text, /bee: last success 22 Oct, 04:36 BST\. Error: Bee token was not accepted\./);
  assert.match(report.text, /2026-10-21: 1/);
  assert.match(report.text, /0 active\. 0 decisions stored\./);
});

test("a missing WHOOP grant is stated on its own", () => {
  const report = morningReport({
    ...snapshot,
    whoopConnected: false,
    whoopExpiresAt: null,
    whoopLastSuccessAt: null,
    whoopLastError: null,
  });
  assert.match(report.text, /Not connected/);
});
