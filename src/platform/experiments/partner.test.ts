import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import {
  assertSampleAllowed,
  loadedRowsHaveNoEmail,
  parsePartnerCsv,
  partnerImportId,
  sampleCsv,
  validatePartnerRows,
} from "@/src/platform/experiments/partner";
import { parseExperiment } from "@/src/platform/experiments/protocol/validate";

function config() {
  const parsed = parseExperiment(JSON.parse(readFileSync("experiments/barbara-dry-run.json", "utf8")));
  if (!parsed.ok || parsed.kind !== "monitoring") {
    throw new Error("expected barbara-dry-run");
  }
  return parsed.config;
}

function validate(csv: string, extra: Partial<Parameters<typeof validatePartnerRows>[0]> = {}) {
  const parsed = parsePartnerCsv(csv);
  assert.equal(parsed.errors.length, 0);
  return validatePartnerRows({
    rows: parsed.rows,
    config: config(),
    allowlistedEmail: "user1@example.com",
    enrolled: true,
    memberKey: "abc123",
    importId: partnerImportId(csv),
    alreadyImported: false,
    ...extra,
  });
}

test("partner row validation covers each rejection reason", () => {
  const header = "email,measure_id,timepoint_id,value";
  const unknownMeasure = validate(`${header}\nuser1@example.com,nope,baseline,10`);
  assert.equal(unknownMeasure.rejected[0]?.reason, "unknown_measure");

  const unknownTimepoint = validate(`${header}\nuser1@example.com,reference.digital_battery,mid,10`);
  assert.equal(unknownTimepoint.rejected[0]?.reason, "unknown_timepoint");

  const range = validate(`${header}\nuser1@example.com,reference.digital_battery,baseline,140`);
  assert.equal(range.rejected[0]?.reason, "number_out_of_range");

  const category = validate(`${header}\nuser1@example.com,biomarker.ptau217_group,baseline,maybe`);
  assert.equal(category.rejected[0]?.reason, "unknown_category");

  const email = validate(`${header}\nstranger@example.com,reference.digital_battery,baseline,10`);
  assert.equal(email.rejected[0]?.reason, "email_not_allowlisted");

  const enrolled = validate(`${header}\nuser1@example.com,reference.digital_battery,baseline,10`, {
    enrolled: false,
    memberKey: null,
  });
  assert.equal(enrolled.rejected[0]?.reason, "not_enrolled");

  const ok = validate(
    `${header}\nuser1@example.com,reference.digital_battery,baseline,72\nuser1@example.com,biomarker.ptau217_group,baseline,negative`,
  );
  assert.equal(ok.rejected.length, 0);
  assert.equal(ok.accepted.length, 2);
  assert.equal(ok.accepted[0].is_synthetic, true);
  assert.equal(loadedRowsHaveNoEmail(ok.accepted), true);
});

test("duplicate file is refused", () => {
  const csv = "email,measure_id,timepoint_id,value\nuser1@example.com,reference.digital_battery,baseline,72";
  const result = validate(csv, { alreadyImported: true });
  assert.equal(result.rejected[0]?.reason, "duplicate_file");
  assert.equal(result.accepted.length, 0);
});

test("sample file is refused in production", () => {
  assert.throws(() => assertSampleAllowed("production"), /test experiments/);
  const csv = sampleCsv(config(), "user1@example.com");
  assert.match(csv, /reference.digital_battery/);
  assert.match(csv, /biomarker.ptau217_group/);
  assert.equal(csv.includes("TODO"), false);
});
