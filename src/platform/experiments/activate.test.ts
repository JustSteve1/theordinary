import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import {
  assertStartAllowed,
  missingFeatures,
  parseActivateArgs,
  parseStartDate,
} from "@/src/platform/experiments/activate";
import { hasDecisionAssigner } from "@/src/platform/experiments/protocol/designs";

test("--start is refused in production", () => {
  assert.throws(() => assertStartAllowed("production", "2026-09-21"), /test experiments/);
  assert.doesNotThrow(() => assertStartAllowed("test", "2026-09-21"));
  assert.doesNotThrow(() => assertStartAllowed("production", undefined));
});

test("activate args and start date parse", () => {
  const parsed = parseActivateArgs(["barbara-dry-run", "--enrol-me", "--start", "2026-09-21"]);
  assert.equal(parsed.id, "barbara-dry-run");
  assert.equal(parsed.enrolMe, true);
  assert.equal(parsed.start, "2026-09-21");
  assert.equal(parseStartDate("2026-09-21"), "2026-09-21");
  assert.throws(() => parseStartDate("21-09-2026"), /YYYY-MM-DD/);
});

test("decideToday skips monitoring experiments", () => {
  const dryRun = JSON.parse(readFileSync("experiments/barbara-dry-run.json", "utf8"));
  assert.equal(hasDecisionAssigner(dryRun), false);
  assert.equal(
    hasDecisionAssigner({
      design: "micro_randomised_daily",
      schema_version: undefined,
    }),
    true,
  );
});

test("local feature registry accepts recall.false_alarm", () => {
  assert.deepEqual(
    missingFeatures(["recall.false_alarm", "not.a.feature"], ["whoop.hrv_rmssd_ms"]),
    ["not.a.feature"],
  );
});
