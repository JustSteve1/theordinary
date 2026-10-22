import checkinStreak from "@/nudges/rules/checkin-streak.json";
import followThrough from "@/nudges/rules/follow-through.json";
import moodLift from "@/nudges/rules/mood-lift.json";
import recoveryMorning from "@/nudges/rules/recovery-morning.json";
import recoveryRebound from "@/nudges/rules/recovery-rebound.json";
import richnessUp from "@/nudges/rules/richness-up.json";
import bundledCopy from "@/nudges/copy/en.json";
import { DOMAINS, isDomain, type Domain } from "@/src/platform/experiments/config";

export const OPS = ["gte", "lte", "eq", "in", "between"] as const;
export const TRIGGERS = ["checkin_saved", "experiment_done", "daily_morning", "mood_saved"] as const;
/** A reward fires after a positive change the member made; a nudge fires before. */
export const KINDS = ["reinforcement", "reward"] as const;
export { DOMAINS };

export type Op = (typeof OPS)[number];
export type Trigger = (typeof TRIGGERS)[number];
export type Kind = (typeof KINDS)[number];

export type Comparison = {
  metric: string;
  op: Op;
  value: number | number[];
};

export type Condition = { all: Condition[] } | { any: Condition[] } | Comparison;

export type NudgeRule = {
  id: string;
  version: number;
  kind: Kind;
  /** Per-day slot. At most one send per category per London day. */
  category: string;
  /** health acts on WHOOP signals; mindset acts on what Bee heard or the member said. */
  domain: Domain;
  trigger: Trigger;
  conditions: Condition;
  message: { key: string; params: string[] };
  send_probability: number;
  cooldown_hours: number;
  priority: number;
  expires_after_hours: number;
};

export type CopyTemplate = {
  title: string;
  body: string;
};

export type CopyBook = Record<string, CopyTemplate>;

const PLACEHOLDER = /\{([a-z0-9_]+)\}/g;

let cachedRules: NudgeRule[] | undefined;
let cachedCopy: CopyBook | undefined;

export function loadRules(): NudgeRule[] {
  if (!cachedRules) {
    const copy = loadCopy();
    cachedRules = [
      checkinStreak,
      richnessUp,
      recoveryMorning,
      recoveryRebound,
      followThrough,
      moodLift,
    ].map((raw) => {
      const result = validateRule(raw, copy);
      if (!result.ok) {
        const id = raw && typeof raw === "object" && "id" in raw ? String(raw.id) : "rule";
        throw new Error(`${id}: ${result.errors.join("; ")}`);
      }
      return result.rule;
    });
  }
  return cachedRules;
}

export function loadCopy(): CopyBook {
  if (!cachedCopy) {
    const result = validateCopy(bundledCopy);
    if (!result.ok) {
      throw new Error(`nudges copy: ${result.errors.join("; ")}`);
    }
    cachedCopy = result.copy;
  }
  return cachedCopy;
}

export function rulesFor(trigger: Trigger): NudgeRule[] {
  return loadRules()
    .filter((rule) => rule.trigger === trigger)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function validateCopy(
  input: unknown,
): { ok: true; copy: CopyBook } | { ok: false; errors: string[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["copy must be an object"] };
  }
  const copy: CopyBook = {};
  const errors: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${key} must be an object`);
      continue;
    }
    const title = "title" in value ? value.title : undefined;
    const body = "body" in value ? value.body : undefined;
    if (typeof title !== "string" || !title.trim()) {
      errors.push(`${key}.title`);
    }
    if (typeof body !== "string" || !body.trim()) {
      errors.push(`${key}.body`);
    }
    if (typeof body === "string" && /\{[^}]*\}/.test(body)) {
      const names = placeholders(body);
      if (names === null) {
        errors.push(`${key}.body placeholder`);
      }
    }
    if (typeof title === "string" && typeof body === "string" && title.trim() && body.trim()) {
      copy[key] = { title, body };
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, copy };
}

export function validateRule(
  input: unknown,
  copy: CopyBook = loadCopy(),
): { ok: true; rule: NudgeRule } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["rule must be an object"] };
  }
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : "";
  if (!id) {
    errors.push("id");
  }
  const version = integer(raw.version);
  if (version === null || version < 1) {
    errors.push("version");
  }
  const kind = raw.kind;
  if (!isKind(kind)) {
    errors.push("kind");
  }
  const category = text(raw.category);
  if (!category) {
    errors.push("category");
  }
  const domain = raw.domain;
  if (!isDomain(domain)) {
    errors.push("domain");
  }
  const trigger = raw.trigger;
  if (!isTrigger(trigger)) {
    errors.push("trigger");
  }
  const conditions = parseCondition(raw.conditions, "conditions");
  errors.push(...conditions.errors);
  const message = raw.message;
  const messageKey =
    message && typeof message === "object" && "key" in message && typeof message.key === "string"
      ? message.key
      : "";
  const params =
    message && typeof message === "object" && "params" in message && Array.isArray(message.params)
      ? message.params
      : null;
  if (!messageKey) {
    errors.push("message.key");
  } else if (!copy[messageKey]) {
    errors.push("message.key missing");
  }
  if (!params || params.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push("message.params");
  }
  if (messageKey && copy[messageKey] && params && params.every((item) => typeof item === "string")) {
    const names = placeholders(copy[messageKey].body);
    if (names === null) {
      errors.push("message placeholder");
    } else {
      const wanted = new Set(params);
      for (const name of names) {
        if (!wanted.has(name)) {
          errors.push(`unknown placeholder ${name}`);
        }
      }
      for (const name of params) {
        if (!names.includes(name)) {
          errors.push(`unknown placeholder ${name}`);
        }
      }
    }
  }
  const probability = raw.send_probability;
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
    errors.push("send_probability");
  }
  const cooldown = raw.cooldown_hours;
  if (typeof cooldown !== "number" || !Number.isFinite(cooldown) || cooldown < 0) {
    errors.push("cooldown_hours");
  }
  const priority = integer(raw.priority);
  if (priority === null) {
    errors.push("priority");
  }
  const expires = raw.expires_after_hours;
  if (typeof expires !== "number" || !Number.isFinite(expires) || expires <= 0) {
    errors.push("expires_after_hours");
  }
  if (
    errors.length ||
    !conditions.condition ||
    !isTrigger(trigger) ||
    version === null ||
    priority === null ||
    !isKind(kind) ||
    !category ||
    !isDomain(domain) ||
    !params ||
    typeof probability !== "number" ||
    typeof cooldown !== "number" ||
    typeof expires !== "number"
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    rule: {
      id,
      version,
      kind,
      category,
      domain,
      trigger,
      conditions: conditions.condition,
      message: { key: messageKey, params: params as string[] },
      send_probability: probability,
      cooldown_hours: cooldown,
      priority,
      expires_after_hours: expires,
    },
  };
}

export function evaluateCondition(condition: Condition, metrics: Record<string, number>): boolean {
  if ("all" in condition) {
    return condition.all.every((child) => evaluateCondition(child, metrics));
  }
  if ("any" in condition) {
    return condition.any.some((child) => evaluateCondition(child, metrics));
  }
  const value = metrics[condition.metric];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }
  if (condition.op === "gte") {
    return value >= numberValue(condition.value);
  }
  if (condition.op === "lte") {
    return value <= numberValue(condition.value);
  }
  if (condition.op === "eq") {
    return value === numberValue(condition.value);
  }
  if (condition.op === "in") {
    return Array.isArray(condition.value) && condition.value.includes(value);
  }
  const [low, high] = Array.isArray(condition.value) ? condition.value : [];
  return typeof low === "number" && typeof high === "number" && value >= low && value <= high;
}

export function renderTemplate(
  key: string,
  params: Record<string, number>,
  copy: CopyBook = loadCopy(),
): { title: string; message: string } | null {
  const template = copy[key];
  if (!template) {
    return null;
  }
  let message = template.body;
  for (const [name, value] of Object.entries(params)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    const shown = Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
    message = message.replaceAll(`{${name}}`, shown);
  }
  if (/\{[a-z0-9_]+\}/.test(message)) {
    return null;
  }
  return { title: template.title, message };
}

function parseCondition(
  input: unknown,
  path: string,
): { condition: Condition | null; errors: string[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { condition: null, errors: [path] };
  }
  const raw = input as Record<string, unknown>;
  if ("all" in raw || "any" in raw) {
    const key = "all" in raw ? "all" : "any";
    if ("metric" in raw || ("all" in raw && "any" in raw)) {
      return { condition: null, errors: [`${path} combinator`] };
    }
    if (!Array.isArray(raw[key]) || raw[key].length === 0) {
      return { condition: null, errors: [`${path}.${key}`] };
    }
    const children: Condition[] = [];
    const errors: string[] = [];
    raw[key].forEach((child, index) => {
      const parsed = parseCondition(child, `${path}.${key}.${index}`);
      errors.push(...parsed.errors);
      if (parsed.condition) {
        children.push(parsed.condition);
      }
    });
    if (errors.length) {
      return { condition: null, errors };
    }
    return {
      condition: key === "all" ? { all: children } : { any: children },
      errors: [],
    };
  }
  const metric = text(raw.metric);
  const op = raw.op;
  if (!metric) {
    return { condition: null, errors: [`${path}.metric`] };
  }
  if (typeof op !== "string" || !OPS.includes(op as Op)) {
    return { condition: null, errors: [`${path}.op`] };
  }
  const value = parseValue(op as Op, raw.value);
  if (value === null) {
    return { condition: null, errors: [`${path}.value`] };
  }
  return { condition: { metric, op: op as Op, value }, errors: [] };
}

function parseValue(op: Op, value: unknown): number | number[] | null {
  if (op === "in") {
    return Array.isArray(value) && value.length > 0 && value.every(isFiniteNumber) ? value : null;
  }
  if (op === "between") {
    return Array.isArray(value) &&
      value.length === 2 &&
      isFiniteNumber(value[0]) &&
      isFiniteNumber(value[1]) &&
      value[0] <= value[1]
      ? [value[0], value[1]]
      : null;
  }
  return isFiniteNumber(value) ? value : null;
}

function placeholders(body: string): string[] | null {
  const names: string[] = [];
  const seen = body.match(/\{[^}]*\}/g) ?? [];
  for (const token of seen) {
    const match = new RegExp(`^${PLACEHOLDER.source}$`).exec(token);
    if (!match) {
      return null;
    }
    names.push(match[1]);
  }
  return names;
}

function numberValue(value: number | number[]) {
  return Array.isArray(value) ? Number.NaN : value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isTrigger(value: unknown): value is Trigger {
  return typeof value === "string" && TRIGGERS.includes(value as Trigger);
}

function isKind(value: unknown): value is Kind {
  return typeof value === "string" && KINDS.includes(value as Kind);
}
