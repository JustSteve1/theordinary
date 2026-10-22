import assert from "node:assert/strict";
import test from "node:test";

import {
  BARBARA_BATTERY_CUTOFF,
  barbaraBatteryBelowCutoff,
  barbaraMarkerPresent,
  barbaraPtau217Positive,
} from "@/src/platform/experiments/barbara";

test("BARBARA marker is ptau217 positive until a composite is defined", () => {
  assert.equal(barbaraPtau217Positive("positive"), true);
  assert.equal(barbaraPtau217Positive("negative"), false);
  assert.equal(barbaraPtau217Positive("indeterminate"), false);
  assert.equal(barbaraPtau217Positive(null), false);
  assert.equal(barbaraMarkerPresent({ ptau217_group: "positive" }), true);
  assert.equal(barbaraMarkerPresent({ ptau217_group: "negative", battery: 40 }), false);
  assert.equal(BARBARA_BATTERY_CUTOFF, null);
  assert.equal(barbaraBatteryBelowCutoff(40), null);
});
