import { drawRandU } from "@/src/platform/nudges/randomise";
import { evaluateCondition, type NudgeRule, type Trigger } from "@/src/platform/nudges/rules";
import { londonDayBounds } from "@/src/platform/nudges/time";
import type { NudgeStore } from "@/src/platform/nudges/types";

export type MetricsFor = (
  trigger: Trigger,
  userId: string,
  eventId: string,
  now: Date,
) => Promise<Record<string, number>>;

export type EngineDeps = {
  store: NudgeStore;
  flag: boolean;
  salt: string | null;
  rules: NudgeRule[];
  metrics: MetricsFor;
};

export type NudgeEvent = {
  type: Trigger;
  userId: string;
  triggerKey: string;
  now?: Date;
};

export async function evaluate(event: NudgeEvent, deps: EngineDeps) {
  if (!deps.flag) {
    return 0;
  }
  if (!deps.salt) {
    console.error("nudge", "NUDGE_SALT must be at least 32 characters.");
    return 0;
  }
  if (!event.triggerKey) {
    return 0;
  }
  if (!(await deps.store.hasHealthConsent(event.userId))) {
    return 0;
  }
  if (!(await deps.store.readEnabled(event.userId))) {
    return 0;
  }

  const now = event.now ?? new Date();
  const metrics = await deps.metrics(event.type, event.userId, event.triggerKey, now);
  const rules = deps.rules
    .filter((rule) => rule.trigger === event.type)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const day = londonDayBounds(now);
  let written = 0;

  for (const rule of rules) {
    if (!evaluateCondition(rule.conditions, metrics)) {
      continue;
    }
    const params = paramsFor(rule, metrics);
    if (!params) {
      continue;
    }
    const last = await deps.store.lastFiredAt(event.userId, rule.id);
    if (last && now.getTime() - last.getTime() < rule.cooldown_hours * 3_600_000) {
      continue;
    }
    const sends = await deps.store.sendsBetween(event.userId, day.start, day.end);
    if (sends.length >= 2 || sends.some((send) => send.category === rule.category)) {
      continue;
    }
    const randU = drawRandU({
      ruleId: rule.id,
      version: rule.version,
      userId: event.userId,
      triggerKey: event.triggerKey,
      salt: deps.salt,
    });
    const send = randU < rule.send_probability;
    const result = await deps.store.insert({
      userId: event.userId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      kind: rule.kind,
      category: rule.category,
      domain: rule.domain,
      trigger: rule.trigger,
      triggerKey: event.triggerKey,
      decision: send ? "send" : "hold",
      probability: rule.send_probability,
      randU,
      messageKey: rule.message.key,
      params,
      priority: rule.priority,
      createdAt: now,
      expiresAt: new Date(now.getTime() + rule.expires_after_hours * 3_600_000),
      status: send ? "pending" : "held",
      channel: "in_app",
    });
    if (result === "inserted") {
      written += 1;
    }
  }
  return written;
}

function paramsFor(rule: NudgeRule, metrics: Record<string, number>) {
  const params: Record<string, number> = {};
  for (const name of rule.message.params) {
    const value = metrics[name];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    params[name] = value;
  }
  return params;
}
