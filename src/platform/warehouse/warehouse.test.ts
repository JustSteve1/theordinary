import assert from "node:assert/strict";
import test from "node:test";

import { beeActivityRow, beeDailyDay, experimentWarehouseRow, scoreRunRow } from "@/src/platform/warehouse/export";
import { estimateEffect, syntheticFrame } from "@/src/platform/warehouse/estimator";
import { assertNoSpeech, isBannedColumn, SpeechFirewallError } from "@/src/platform/warehouse/firewall";
import { memberKey } from "@/src/platform/warehouse/member-key";
import { shouldExportMember } from "@/src/platform/warehouse/privacy";
import { TABLE_SCHEMAS } from "@/src/platform/warehouse/tables";

process.env.MEMBER_KEY_SECRET = "warehouse-test-secret-0123456789abcdef";

test("member key is stable hex", () => {
  const key = memberKey("4673030b-0f89-4000-96fb-fc3ed17cdfe5");
  assert.equal(key, memberKey("4673030b-0f89-4000-96fb-fc3ed17cdfe5"));
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.notEqual(key, memberKey("someone-else"));
});

test("firewall rejects banned keys, nested keys, and long strings", () => {
  const banned = [
    "talk_text",
    "narrative",
    "transcript",
    "summary",
    "short_summary",
    "detail",
    "text",
    "question",
    "answer",
    "answers",
    "clauses",
    "evidence",
    "body",
    "message",
    "content",
    "notes",
    "facts",
    "spoken_text",
  ];
  for (const key of banned) {
    assert.throws(() => assertNoSpeech("app_checkins", [{ [key]: "x" }]), SpeechFirewallError);
    assert.throws(
      () => assertNoSpeech("app_checkins", [{ nested: { [key]: "x" } }]),
      SpeechFirewallError,
    );
  }
  assert.throws(
    () => assertNoSpeech("app_checkins", [{ note: "x".repeat(201) }]),
    SpeechFirewallError,
  );
});

test("firewall allows a WHOOP payload", () => {
  assert.doesNotThrow(() =>
    assertNoSpeech("whoop_sleep", [
      {
        member_key: "abc",
        payload: { summary: "x".repeat(500), user_note_text: "kept inside payload" },
      },
    ]),
  );
  assert.throws(
    () => assertNoSpeech("app_checkins", [{ payload: { summary: "no" } }]),
    SpeechFirewallError,
  );
});

test("warehouse columns are not speech keys", () => {
  for (const table of Object.values(TABLE_SCHEMAS)) {
    for (const column of table.columns) {
      assert.equal(isBannedColumn(column.name), false, column.name);
    }
  }
});

test("score export keeps metrics and drops clauses", () => {
  const row = scoreRunRow("member", "checkin-1", {
    scorer_version: "2.0.0",
    config_hash: "abc",
    matcher_tier: "lexical",
    computed_at: "2026-10-19T20:34:00.000Z",
    payload: {
      metrics: { accuracy: 70, richness: 62.8, detail: 10 },
      dimensions: [{ id: "people", level: 67 }],
      flags: { practice: false, emptyTalk: false },
      conditions: { lagDays: 1, lagBand: "1", practice: false },
      clauses: [{ text: "secret speech" }],
      facts: [{ text: "also secret" }],
    },
  });
  assert.equal("clauses" in row, false);
  assert.equal("facts" in row, false);
  assert.equal(row.metric_detail, 10);
  assert.equal(row.dim_people_level, 67);
  assert.doesNotThrow(() => assertNoSpeech("app_score_runs", [row]));
});

test("bee echoes are flagged and carry no text", () => {
  const row = beeActivityRow({
    member: "member",
    kind: "journal",
    startMs: Date.parse("2026-10-19T20:34:00.000Z"),
    endMs: null,
    summary: "Check-in from The Ordinary: a long spoken entry",
    detail: "Check-in from The Ordinary: more speech that must not be stored",
  });
  assert.equal(row.is_ordinary_echo, true);
  assert.equal(row.duration_s, null);
  assert.equal("summary" in row, false);
  assert.equal("detail" in row, false);
  assert.equal("text" in row, false);
  assert.doesNotThrow(() => assertNoSpeech("bee_activity", [row]));
});

test("bee daily summaries are dated by their millisecond stamp in London time", () => {
  assert.equal(beeDailyDay({ date_time: 1791226815103, created_at: 1791226815103 }), "2026-10-05");
  assert.equal(beeDailyDay({ created_at: Date.parse("2026-10-19T23:30:00.000Z") }), "2026-10-20");
  assert.equal(beeDailyDay({ summary: "no stamp" }), null);
});

test("a withdrawn member is skipped", () => {
  assert.equal(shouldExportMember("consent withdrawn"), false);
  assert.equal(shouldExportMember(null), true);
});

test("experiment export strips instruction text", () => {
  const row = experimentWarehouseRow({
    id: "first-experiment",
    version: 1,
    status: "draft",
    config_hash: "abc",
    config: {
      design: "micro_randomised_daily",
      treatment_probability: 0.5,
      hypothesis: "TODO",
      notes: "private note",
      arms: [
        { name: "control", instruction: null },
        { name: "treatment", instruction: "Do this private thing" },
      ],
      primary_outcome: { feature_id: "whoop.hrv_rmssd_ms.dev", offset_days: 1, direction: "increase" },
    },
  });
  const encoded = JSON.stringify(row);
  assert.equal(encoded.includes("TODO"), false);
  assert.equal(encoded.includes("instruction"), false);
  assert.equal(encoded.includes("private"), false);
  assert.equal(row.primary_feature_id, "whoop.hrv_rmssd_ms.dev");
  assert.doesNotThrow(() => assertNoSpeech("experiments", [row]));
});

test("synthetic effect estimator separates a real effect from none", () => {
  const treated = estimateEffect(syntheticFrame(4, 11), { experimentId: "A" });
  const none = estimateEffect(syntheticFrame(0, 11), { experimentId: "B" });
  assert.equal(treated.status, "ok");
  assert.equal(none.status, "ok");
  assert.ok(treated.p025 !== null && treated.p975 !== null);
  assert.ok(none.p025 !== null && none.p975 !== null);
  assert.ok(treated.p025 <= 4 && treated.p975 >= 4);
  assert.ok(treated.p025 > 0);
  assert.ok(Math.abs((treated.beta ?? 0) - 4) < 2.5);
  assert.ok(none.p025 <= 0 && none.p975 >= 0);
});

test("fewer than 14 outcomes is insufficient", () => {
  const rows = syntheticFrame(4, 3).slice(0, 10);
  assert.equal(estimateEffect(rows).status, "insufficient_data");
});
