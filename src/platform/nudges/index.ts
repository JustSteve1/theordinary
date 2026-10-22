import { channels } from "@/src/platform/nudges/channels";
import { evaluate, type EngineDeps } from "@/src/platform/nudges/engine";
import { nudgeSalt } from "@/src/platform/nudges/randomise";
import { loadRules } from "@/src/platform/nudges/rules";
import { gatherMetrics } from "@/src/platform/nudges/signals";
import { sqlStore } from "@/src/platform/nudges/store";
import { dateKey } from "@/src/platform/recall/dates";
import type { NudgeRow, NudgeStatus, NudgeStore } from "@/src/platform/nudges/types";

const store = sqlStore();

export type RenderedNudge = {
  id: string;
  kind: string;
  domain: string | null;
  title: string;
  message: string;
  when: string;
  status: NudgeStatus;
  createdAt: string;
};

export type NudgeAction = "shown" | "thanks" | "helpful" | "not_for_me";

export type ViewOverride = {
  store?: NudgeStore;
  flag?: boolean;
  now?: Date;
};

export function nudgesFlagEnabled() {
  return process.env.NUDGES_ENABLED === "true";
}

export async function emitNudgeEvent(
  event: {
    type: "checkin_saved" | "experiment_done" | "mood_saved";
    userId: string;
    eventId: string;
  },
  override?: Partial<EngineDeps> & { now?: Date },
) {
  try {
    await evaluate(
      {
        type: event.type,
        userId: event.userId,
        triggerKey: event.eventId,
        now: override?.now,
      },
      { ...defaultDeps(), ...engineOverride(override) },
    );
  } catch (error) {
    console.error("nudge", error instanceof Error ? error.message : error);
  }
}

export async function runScheduledNudges(now = new Date(), override?: Partial<EngineDeps>) {
  const resolved = { ...defaultDeps(), ...override };
  if (!resolved.flag) {
    return { ran: 0, written: 0 };
  }
  if (!resolved.salt) {
    console.error("nudge", "NUDGE_SALT must be at least 32 characters.");
    return { ran: 0, written: 0 };
  }
  const members = await resolved.store.consentedEnabledMembers();
  const triggerKey = dateKey(now.getTime());
  let written = 0;
  for (const userId of members) {
    try {
      written += await evaluate({ type: "daily_morning", userId, triggerKey, now }, resolved);
    } catch (error) {
      console.error("nudge", error instanceof Error ? error.message : error);
    }
  }
  return { ran: members.length, written };
}

export async function nudgesEnabledFor(userId: string, override?: ViewOverride) {
  const flag = override?.flag ?? nudgesFlagEnabled();
  if (!flag) {
    return false;
  }
  const current = override?.store ?? store;
  if (!(await current.hasHealthConsent(userId))) {
    return false;
  }
  return current.readEnabled(userId);
}

export async function nudgeControls(userId: string, override?: ViewOverride) {
  const flag = override?.flag ?? nudgesFlagEnabled();
  if (!flag) {
    return null;
  }
  return { enabled: await (override?.store ?? store).readEnabled(userId) };
}

export async function saveNudgeSetting(userId: string, enabled: boolean, override?: ViewOverride) {
  const flag = override?.flag ?? nudgesFlagEnabled();
  if (!flag) {
    return;
  }
  await (override?.store ?? store).writeEnabled(userId, enabled);
}

export async function activeNudges(userId: string, limit = 1, override?: ViewOverride) {
  if (!(await nudgesEnabledFor(userId, override))) {
    return [];
  }
  const current = override?.store ?? store;
  const now = override?.now ?? new Date();
  await current.expireOld(userId, now);
  return present(current, userId, await current.listActive(userId, now, limit), now);
}

export async function nudgeHistory(userId: string, days = 30, override?: ViewOverride) {
  if (!(await nudgesEnabledFor(userId, override))) {
    return [];
  }
  const current = override?.store ?? store;
  const now = override?.now ?? new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return present(current, userId, await current.history(userId, since), now);
}

export async function recordNudgeInteraction(
  userId: string,
  nudgeId: string,
  action: NudgeAction,
  override?: ViewOverride,
) {
  if (!(await nudgesEnabledFor(userId, override))) {
    return false;
  }
  const current = override?.store ?? store;
  const now = override?.now ?? new Date();
  if (action === "shown") {
    return current.markShown(userId, nudgeId, now);
  }
  const helpful = action === "helpful" ? true : action === "not_for_me" ? false : null;
  return current.dismiss(userId, nudgeId, helpful, now);
}

function defaultDeps(): EngineDeps {
  return {
    store,
    flag: nudgesFlagEnabled(),
    salt: nudgeSalt(),
    rules: loadRules(),
    metrics: gatherMetrics,
  };
}

function engineOverride(override?: Partial<EngineDeps> & { now?: Date }): Partial<EngineDeps> {
  if (!override) {
    return {};
  }
  const rest: Partial<EngineDeps> & { now?: Date } = { ...override };
  delete rest.now;
  return rest;
}

async function present(current: NudgeStore, userId: string, rows: NudgeRow[], now: Date) {
  const channel = channels.in_app;
  const rendered: RenderedNudge[] = [];
  for (const row of rows) {
    const view = channel.render(row, now);
    if (!view) {
      continue;
    }
    if (row.status === "pending") {
      await current.markShown(userId, row.id, now);
    }
    rendered.push({
      id: row.id,
      kind: row.kind,
      domain: row.domain,
      status: row.status === "pending" ? "shown" : row.status,
      createdAt: row.createdAt.toISOString(),
      ...view,
    });
  }
  return rendered;
}
