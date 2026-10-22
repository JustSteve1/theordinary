import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import {
  evaluateCondition,
  loadCopy,
  loadRules,
  validateRule,
  type Condition,
  type CopyBook,
} from "@/src/platform/nudges/rules";
import { memoryStore, numericParams, type MemoryStore } from "@/src/platform/nudges/store";
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
