import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCondition,
  loadCopy,
  loadRules,
  validateRule,
  type Condition,
  type CopyBook,
} from "@/src/platform/nudges/rules";

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
