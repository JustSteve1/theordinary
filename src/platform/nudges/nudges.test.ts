import assert from "node:assert/strict";
import test from "node:test";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { helpfulFor, nudgeAction } from "@/src/features/nudges/interact";
import { dateKey } from "@/src/platform/recall/dates";
import { appNudgeRow, nudgeExportEligible } from "@/src/platform/warehouse/export";
import { assertNoSpeech, isBannedColumn } from "@/src/platform/warehouse/firewall";
import { TABLE_SCHEMAS } from "@/src/platform/warehouse/tables";
import { evaluate } from "@/src/platform/nudges/engine";
import {
  activeNudges,
  emitNudgeEvent,
  nudgeControls,
  nudgeHistory,
  recordNudgeInteraction,
  runScheduledNudges,
  saveNudgeSetting,
} from "@/src/platform/nudges";
import { drawRandU } from "@/src/platform/nudges/randomise";
import {
  evaluateCondition,
  loadCopy,
  loadRules,
  validateRule,
  type Condition,
  type CopyBook,
  type NudgeRule,
} from "@/src/platform/nudges/rules";
import { checkinStreakDays, richnessMetrics } from "@/src/platform/nudges/signals/checkins";
import { experimentMetrics } from "@/src/platform/nudges/signals/experiments";
import { recoveryMetric } from "@/src/platform/nudges/signals/whoop";
import { memoryStore, numericParams, type MemoryStore } from "@/src/platform/nudges/store";
import { londonIsoWeek, londonMidnight } from "@/src/platform/nudges/time";
import type { NudgeDraft } from "@/src/platform/nudges/types";

const copy: CopyBook = loadCopy();

function baseRule(patch: Record<string, unknown> = {}) {
  return {
    id: "sample",
    version: 1,
    kind: "reinforcement",
    category: "consistency",
    trigger: "checkin_saved",
    conditions: { all: [{ metric: "checkin_streak_days", op: "gte", value: 1 }] },
    message: { key: "streak", params: ["checkin_streak_days"] },
    send_probability: 0.8,
    cooldown_hours: 20,
    priority: 2,
    expires_after_hours: 36,
    ...patch,
  };
}

test("the four starter rules validate", () => {
  const rules = loadRules();
  assert.deepEqual(
    rules.map((rule) => rule.id).sort(),
    ["checkin-streak", "follow-through", "recovery-morning", "richness-up"],
  );
  const streak = rules.find((rule) => rule.id === "checkin-streak");
  assert.equal(streak?.trigger, "checkin_saved");
  assert.equal(streak?.message.key, "streak");
  assert.equal(copy.streak.title, "On a roll");
  assert.equal(copy.richness_up.title, "Rich recall");
  assert.equal(copy.recovery_high.title, "Well recovered");
  assert.equal(copy.follow_through.title, "Follow-through");
});

test("a bad op, missing copy, unknown placeholder, probability, and trigger fail", () => {
  const badOp = validateRule(
    baseRule({
      conditions: { all: [{ metric: "checkin_streak_days", op: "gt", value: 1 }] },
    }),
    copy,
  );
  assert.equal(badOp.ok, false);
  if (!badOp.ok) {
    assert.ok(badOp.errors.some((error) => error.includes("op")));
  }

  const missingCopy = validateRule(baseRule({ message: { key: "missing", params: [] } }), copy);
  assert.equal(missingCopy.ok, false);
  if (!missingCopy.ok) {
    assert.ok(missingCopy.errors.some((error) => error.includes("message.key")));
  }

  const unknownPlaceholder = validateRule(
    baseRule({ message: { key: "streak", params: ["not_in_the_template"] } }),
    copy,
  );
  assert.equal(unknownPlaceholder.ok, false);
  if (!unknownPlaceholder.ok) {
    assert.ok(unknownPlaceholder.errors.some((error) => error.includes("unknown placeholder")));
  }

  const extraPlaceholder = validateRule(
    {
      ...baseRule(),
      message: { key: "streak", params: ["checkin_streak_days"] },
    },
    {
      ...copy,
      streak: { title: "On a roll", body: "That's {checkin_streak_days} and {extra}." },
    },
  );
  assert.equal(extraPlaceholder.ok, false);

  for (const send_probability of [-0.1, 1.1]) {
    const result = validateRule(baseRule({ send_probability }), copy);
    assert.equal(result.ok, false, String(send_probability));
    if (!result.ok) {
      assert.ok(result.errors.includes("send_probability"));
    }
  }

  const trigger = validateRule(baseRule({ trigger: "bee" }), copy);
  assert.equal(trigger.ok, false);
  if (!trigger.ok) {
    assert.ok(trigger.errors.includes("trigger"));
  }
});

test("the condition evaluator handles each op, combinator, and a missing metric", () => {
  const metrics = { a: 3, b: 10 };
  const check = (condition: Condition, expected: boolean) => {
    assert.equal(evaluateCondition(condition, metrics), expected);
  };
  check({ metric: "a", op: "gte", value: 3 }, true);
  check({ metric: "a", op: "gte", value: 4 }, false);
  check({ metric: "a", op: "lte", value: 3 }, true);
  check({ metric: "a", op: "lte", value: 2 }, false);
  check({ metric: "b", op: "eq", value: 10 }, true);
  check({ metric: "b", op: "eq", value: 9 }, false);
  check({ metric: "a", op: "in", value: [1, 3, 5] }, true);
  check({ metric: "a", op: "in", value: [1, 2] }, false);
  check({ metric: "b", op: "between", value: [10, 12] }, true);
  check({ metric: "b", op: "between", value: [0, 9] }, false);
  check({ metric: "missing", op: "eq", value: 0 }, false);
  check(
    { all: [{ metric: "a", op: "eq", value: 3 }, { metric: "b", op: "gte", value: 10 }] },
    true,
  );
  check(
    { all: [{ metric: "a", op: "eq", value: 3 }, { metric: "missing", op: "gte", value: 1 }] },
    false,
  );
  check(
    { any: [{ metric: "a", op: "eq", value: 1 }, { metric: "b", op: "eq", value: 10 }] },
    true,
  );
  check(
    { any: [{ metric: "a", op: "eq", value: 1 }, { metric: "missing", op: "eq", value: 1 }] },
    false,
  );
});

function draft(patch: Partial<NudgeDraft> = {}): NudgeDraft {
  const createdAt = patch.createdAt ?? new Date("2026-10-22T08:00:00.000Z");
  return {
    userId: "member-a",
    ruleId: "checkin-streak",
    ruleVersion: 1,
    kind: "reinforcement",
    category: "consistency",
    trigger: "checkin_saved",
    triggerKey: "event-1",
    decision: "send",
    probability: 0.8,
    randU: 0.1,
    messageKey: "streak",
    params: { checkin_streak_days: 3 },
    priority: 2,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 36 * 60 * 60 * 1000),
    status: "pending",
    channel: "in_app",
    ...patch,
  };
}

async function seed(store: MemoryStore, patch: Partial<NudgeDraft> = {}) {
  await store.insert(draft(patch));
  return store.rows[store.rows.length - 1];
}

test("the schema declares nudges and nudge settings", () => {
  const schema = readFileSync("src/platform/db.ts", "utf8");
  assert.match(schema, /create table if not exists nudges/);
  assert.match(schema, /unique \(user_id, rule_id, rule_version, trigger_key\)/);
  assert.match(schema, /create table if not exists nudge_settings/);
  assert.match(schema, /enabled boolean not null default true/);
});

test("the store double inserts once, lists sends, and keeps held rows out", async () => {
  const store = memoryStore();
  const now = new Date("2026-10-22T09:00:00.000Z");
  assert.equal(await store.insert(draft()), "inserted");
  assert.equal(await store.insert(draft()), "duplicate");
  assert.equal(store.rows.length, 1);
  assert.deepEqual(
    numericParams({ checkin_streak_days: 3, note: "no" as unknown as number }),
    { checkin_streak_days: 3 },
  );

  await store.insert(
    draft({
      ruleId: "richness-up",
      triggerKey: "event-2",
      decision: "hold",
      status: "held",
      messageKey: "richness_up",
      params: {},
      priority: 3,
    }),
  );

  const active = await store.listActive("member-a", now, 10);
  assert.deepEqual(active.map((row) => row.ruleId), ["checkin-streak"]);
  const history = await store.history("member-a", new Date("2026-10-01T00:00:00.000Z"));
  assert.deepEqual(history.map((row) => row.ruleId), ["checkin-streak"]);
  assert.equal(await store.readEnabled("member-a"), true);
  await store.writeEnabled("member-a", false);
  assert.equal(await store.readEnabled("member-a"), false);
});

test("shown is recorded once, dismiss keeps the member, and expiry drops pending rows", async () => {
  const store = memoryStore();
  const row = await seed(store);
  const first = new Date("2026-10-22T09:00:00.000Z");
  const second = new Date("2026-10-22T10:00:00.000Z");
  assert.equal(await store.markShown("member-a", row.id, first), true);
  assert.equal(await store.markShown("member-a", row.id, second), true);
  assert.equal(row.shownAt?.toISOString(), first.toISOString());
  assert.equal(await store.dismiss("member-b", row.id, true, second), false);
  assert.equal(row.status, "shown");
  assert.equal(await store.dismiss("member-a", row.id, true, second), true);
  assert.equal(row.status, "dismissed");
  assert.equal(row.helpful, true);

  const pending = await seed(store, {
    ruleId: "recovery-morning",
    triggerKey: "2026-10-22",
    trigger: "daily_morning",
    expiresAt: new Date("2026-10-22T08:30:00.000Z"),
  });
  assert.equal(await store.expireOld("member-a", first), 1);
  assert.equal(pending.status, "expired");
  assert.equal((await store.listActive("member-a", first, 10)).length, 0);
});

const salt = "nudge-salt-0123456789abcdef-extra";

function rule(patch: Partial<NudgeRule> = {}): NudgeRule {
  return {
    id: "sample",
    version: 1,
    kind: "reinforcement",
    category: "consistency",
    trigger: "checkin_saved",
    conditions: { all: [{ metric: "checkin_streak_days", op: "gte", value: 1 }] },
    message: { key: "streak", params: ["checkin_streak_days"] },
    send_probability: 1,
    cooldown_hours: 20,
    priority: 2,
    expires_after_hours: 36,
    ...patch,
  };
}

test("signals read fixtures, including a streak across London midnight", () => {
  const evening = dateKey(Date.parse("2026-10-22T22:30:00Z"));
  const afterMidnight = dateKey(Date.parse("2026-10-22T23:30:00Z"));
  assert.equal(evening, "2026-10-22");
  assert.equal(afterMidnight, "2026-10-23");
  assert.equal(checkinStreakDays([evening, afterMidnight], afterMidnight), 2);
  assert.equal(checkinStreakDays([evening], afterMidnight), 0);

  const richness = richnessMetrics([
    { richness: 80, practice: false },
    { richness: 10, practice: true },
    { richness: 70, practice: false },
    { richness: 60, practice: false },
    { richness: 50, practice: false },
    { richness: 65, practice: false },
    { richness: 55, practice: false },
    { richness: null, practice: false },
  ]);
  assert.equal(richness.recent_scored_checkins, 5);
  assert.equal(richness.richness_vs_recent, 20);
  assert.deepEqual(experimentMetrics(2), { experiment_done_this_week: 2 });

  const now = Date.parse("2026-10-22T07:00:00Z");
  assert.deepEqual(recoveryMetric({ status: "ok", value: 72, atMs: now - 60 * 60 * 1000, now }), {
    whoop_recovery_today: 72,
  });
  assert.deepEqual(recoveryMetric({ status: "disconnected", value: 72, atMs: now, now }), {});
  assert.deepEqual(
    recoveryMetric({ status: "ok", value: 72, atMs: now - 19 * 60 * 60 * 1000, now }),
    {},
  );
  assert.deepEqual(recoveryMetric({ status: "ok", value: null, atMs: now, now }), {});

  const week = londonIsoWeek(new Date("2026-10-22T12:00:00Z"));
  assert.equal(dateKey(week.start.getTime()), "2026-10-19");
  assert.equal(dateKey(week.end.getTime()), "2026-10-26");
  assert.equal(londonMidnight("2026-10-22").toISOString(), "2026-10-21T23:00:00.000Z");
  assert.equal(londonMidnight("2026-11-01").toISOString(), "2026-11-01T00:00:00.000Z");
});

test("the randomiser is deterministic and sends about four fifths", () => {
  const input = { ruleId: "sample", version: 1, userId: "member-a", triggerKey: "a", salt };
  const once = drawRandU(input);
  assert.equal(once, drawRandU(input));
  assert.ok(once >= 0 && once < 1);
  let sent = 0;
  for (let i = 0; i < 10_000; i += 1) {
    if (drawRandU({ ...input, triggerKey: String(i) }) < 0.8) {
      sent += 1;
    }
  }
  const share = sent / 10_000;
  assert.ok(share > 0.75 && share < 0.85, String(share));
});

test("caps, cooldown, idempotency, holds, and a closed gate write the right rows", async () => {
  const now = new Date("2026-10-22T08:00:00.000Z");
  const metrics = async () => ({ checkin_streak_days: 3 });
  const capped = memoryStore();
  await capped.insert(draft({ ruleId: "already-a", triggerKey: "a", category: "memory", createdAt: now }));
  await capped.insert(draft({ ruleId: "already-b", triggerKey: "b", category: "recovery", createdAt: now }));
  assert.equal(
    await evaluate(
      { type: "checkin_saved", userId: "member-a", triggerKey: "fresh", now },
      { store: capped, flag: true, salt, rules: [rule({ id: "third" })], metrics },
    ),
    0,
  );

  const category = memoryStore();
  await category.insert(draft({ createdAt: now }));
  assert.equal(
    await evaluate(
      { type: "checkin_saved", userId: "member-a", triggerKey: "fresh", now },
      {
        store: category,
        flag: true,
        salt,
        rules: [
          rule({ id: "same-category" }),
          rule({
            id: "other",
            category: "memory",
            priority: 3,
            message: { key: "richness_up", params: [] },
          }),
        ],
        metrics,
      },
    ),
    1,
  );
  assert.deepEqual(
    category.rows.map((row) => row.ruleId),
    ["checkin-streak", "other"],
  );

  const cooled = memoryStore();
  await cooled.insert(
    draft({
      ruleId: "sample",
      decision: "hold",
      status: "held",
      createdAt: new Date(now.getTime() - 60 * 60 * 1000),
      triggerKey: "earlier",
    }),
  );
  assert.equal(
    await evaluate(
      { type: "checkin_saved", userId: "member-a", triggerKey: "later", now },
      { store: cooled, flag: true, salt, rules: [rule()], metrics },
    ),
    0,
  );

  const once = memoryStore();
  const event = { type: "checkin_saved" as const, userId: "member-a", triggerKey: "event-1", now };
  const input = { store: once, flag: true, salt, rules: [rule()], metrics };
  assert.equal(await evaluate(event, input), 1);
  assert.equal(await evaluate(event, input), 0);
  assert.equal(once.rows.length, 1);

  const held = memoryStore();
  await evaluate(event, {
    store: held,
    flag: true,
    salt,
    rules: [rule({ send_probability: 0 })],
    metrics,
  });
  assert.equal(held.rows[0].decision, "hold");
  assert.equal((await activeNudges("member-a", 5, { store: held, flag: true, now })).length, 0);
  assert.equal((await nudgeHistory("member-a", 30, { store: held, flag: true, now })).length, 0);

  const closed = memoryStore();
  closed.members.push("member-a");
  let called = false;
  const throwing = async () => {
    called = true;
    throw new Error("signal down");
  };
  assert.equal(
    await evaluate(event, { store: closed, flag: false, salt, rules: [rule()], metrics: throwing }),
    0,
  );
  assert.equal(called, false);
  assert.deepEqual(
    await runScheduledNudges(now, { store: closed, flag: false, salt, rules: [rule()], metrics: throwing }),
    { ran: 0, written: 0 },
  );
  closed.setEnabled("member-a", false);
  assert.equal(
    await evaluate(event, { store: closed, flag: true, salt, rules: [rule()], metrics }),
    0,
  );
  closed.setEnabled("member-a", true);
  closed.setConsent("member-a", false);
  assert.equal(
    await evaluate(event, { store: closed, flag: true, salt, rules: [rule()], metrics }),
    0,
  );
  assert.equal(
    await evaluate(event, { store: closed, flag: true, salt: null, rules: [rule()], metrics }),
    0,
  );
  assert.equal(closed.rows.length, 0);

  closed.setConsent("member-a", true);
  closed.setEnabled("member-a", true);
  await assert.doesNotReject(() =>
    emitNudgeEvent(
      { type: "checkin_saved", userId: "member-a", eventId: "event-1" },
      { store: closed, flag: true, salt, rules: [rule()], metrics: throwing },
    ),
  );
  assert.equal(closed.rows.length, 0);
});

test("the morning run writes a recovery nudge when recovery is high", async () => {
  const store = memoryStore();
  store.members.push("member-a");
  const now = new Date("2026-10-22T07:30:00.000Z");
  const recovery = loadRules().find((item) => item.id === "recovery-morning");
  assert.ok(recovery);
  const result = await runScheduledNudges(now, {
    store,
    flag: true,
    salt,
    rules: [{ ...recovery, send_probability: 1 }],
    metrics: async () => ({ whoop_recovery_today: 70 }),
  });
  assert.equal(result.written, 1);
  assert.equal(store.rows[0].ruleId, "recovery-morning");
  assert.equal(store.rows[0].triggerKey, dateKey(now.getTime()));
  assert.equal(store.rows[0].decision, "send");
  assert.equal(store.rows[0].status, "pending");
});

test("buttons set status and helpful, and a closed gate shows nothing", async () => {
  const now = new Date("2026-10-22T08:30:00.000Z");
  const store = memoryStore();
  const thanks = await seed(store, { triggerKey: "thanks", createdAt: new Date("2026-10-22T08:00:00.000Z") });
  const helpful = await seed(store, { ruleId: "richness-up", triggerKey: "helpful", messageKey: "richness_up", params: {}, priority: 3, createdAt: now });
  const declined = await seed(store, { ruleId: "follow-through", triggerKey: "declined", messageKey: "follow_through", params: { experiment_done_this_week: 1 }, category: "experiments", priority: 2, createdAt: now });
  const foreign = await seed(store, { userId: "member-b", triggerKey: "foreign", createdAt: now });

  assert.equal(nudgeAction("thanks"), "thanks");
  assert.equal(nudgeAction("helpful"), "helpful");
  assert.equal(nudgeAction("not_for_me"), "not_for_me");
  assert.equal(nudgeAction("nope"), null);
  assert.equal(helpfulFor("thanks"), null);
  assert.equal(helpfulFor("helpful"), true);
  assert.equal(helpfulFor("not_for_me"), false);

  assert.equal(await recordNudgeInteraction("member-b", thanks.id, "helpful", { store, flag: true, now }), false);
  assert.equal(thanks.status, "pending");
  assert.equal(await recordNudgeInteraction("member-a", foreign.id, "thanks", { store, flag: true, now }), false);
  assert.equal(foreign.status, "pending");

  assert.equal(await recordNudgeInteraction("member-a", thanks.id, "thanks", { store, flag: true, now }), true);
  assert.equal(thanks.status, "dismissed");
  assert.equal(thanks.helpful, null);
  assert.equal(await recordNudgeInteraction("member-a", helpful.id, "helpful", { store, flag: true, now }), true);
  assert.equal(helpful.helpful, true);
  assert.equal(helpful.status, "dismissed");
  assert.equal(await recordNudgeInteraction("member-a", declined.id, "not_for_me", { store, flag: true, now }), true);
  assert.equal(declined.helpful, false);
  assert.equal(declined.status, "dismissed");

  const visible = memoryStore();
  await visible.insert(draft({ createdAt: new Date("2026-10-22T08:00:00.000Z") }));
  assert.deepEqual(await activeNudges("member-a", 1, { store: visible, flag: false, now }), []);
  assert.deepEqual(await nudgeHistory("member-a", 30, { store: visible, flag: false, now }), []);
  assert.equal(await nudgeControls("member-a", { store: visible, flag: false }), null);
  visible.setEnabled("member-a", false);
  assert.deepEqual(await activeNudges("member-a", 1, { store: visible, flag: true, now }), []);
  assert.deepEqual(await nudgeHistory("member-a", 30, { store: visible, flag: true, now }), []);

  visible.setEnabled("member-a", true);
  const [card] = await activeNudges("member-a", 1, { store: visible, flag: true, now });
  assert.equal(card.title, "On a roll");
  assert.match(card.message, /3 check-ins/);
  assert.equal(card.when, "just now");
  assert.equal(card.status, "shown");
  assert.equal(visible.rows[0].status, "shown");
  assert.equal(visible.rows[0].shownAt?.toISOString(), now.toISOString());
  const again = await activeNudges("member-a", 1, { store: visible, flag: true, now: new Date(now.getTime() + 60_000) });
  assert.equal(again[0].status, "shown");
  assert.equal(visible.rows[0].shownAt?.toISOString(), now.toISOString());

  await saveNudgeSetting("member-a", false, { store: visible, flag: true });
  assert.deepEqual(await activeNudges("member-a", 1, { store: visible, flag: true, now }), []);
  assert.deepEqual(await nudgeControls("member-a", { store: visible, flag: true }), { enabled: false });
});

test("other code imports nudges only through the public index", () => {
  const inside = join("src", "platform", "nudges");
  const bad: string[] = [];
  for (const file of [...sourceFiles("src"), ...sourceFiles("app")]) {
    if (file.startsWith(inside) || file.endsWith("nudges.test.ts")) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    if (/@\/src\/platform\/nudges\/(?!index["'])/.test(text)) {
      bad.push(file);
    }
  }
  assert.deepEqual(bad, []);
});

test("exported nudges are numbers and rule ids, and a withdrawn member is skipped", () => {
  const previous = process.env.MEMBER_KEY_SECRET;
  process.env.MEMBER_KEY_SECRET = "member-key-secret-0123456789abcdef";
  try {
    const sentence = loadCopy().streak.body;
    const row = appNudgeRow(
      {
        id: "nudge-1",
        rule_id: "checkin-streak",
        rule_version: 1,
        kind: "reinforcement",
        category: "consistency",
        trigger: "checkin_saved",
        decision: "hold",
        probability: 0.8,
        rand_u: 0.91,
        message_key: "streak",
        priority: 2,
        created_at: "2026-10-22T08:00:00.000Z",
        expires_at: "2026-10-23T20:00:00.000Z",
        status: "held",
        shown_at: null,
        dismissed_at: null,
        helpful: null,
        channel: "in_app",
        params: { checkin_streak_days: 3 },
        message: sentence,
      },
      "member",
    );
    assert.equal("params" in row, false);
    assert.equal("message" in row, false);
    assert.equal(JSON.stringify(row).includes(sentence), false);
    assert.equal(JSON.stringify(row).includes("checkin_streak_days"), false);
    assert.equal(row.decision, "hold");
    assert.equal(row.probability, 0.8);
    assert.ok(row.nudge_id.startsWith("n_"));
    assert.doesNotThrow(() => assertNoSpeech("app_nudges", [row]));

    const table = TABLE_SCHEMAS.app_nudges;
    assert.equal(table.dataset, "ordinary_raw");
    assert.equal(table.columns.some((column) => column.name === "member_key"), true);
    assert.equal(table.columns.some((column) => column.name === "params" || column.name === "message"), false);
    for (const column of table.columns) {
      assert.equal(isBannedColumn(column.name), false, column.name);
    }
    assert.equal(nudgeExportEligible({ healthAccepted: true, skipError: null }), true);
    assert.equal(nudgeExportEligible({ healthAccepted: false, skipError: null }), false);
    assert.equal(nudgeExportEligible({ healthAccepted: true, skipError: "consent withdrawn" }), false);
  } finally {
    if (previous === undefined) {
      delete process.env.MEMBER_KEY_SECRET;
    } else {
      process.env.MEMBER_KEY_SECRET = previous;
    }
  }
});

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      found.push(path);
    }
  }
  return found;
}
