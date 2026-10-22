import { randomUUID } from "crypto";

import { db, ready } from "@/src/platform/db";
import type { NudgeDraft, NudgeRow, NudgeStatus, NudgeStore } from "@/src/platform/nudges/types";

const COLUMNS = `
  id::text, user_id::text, rule_id, rule_version, kind, category, trigger, trigger_key,
  decision, probability, rand_u, message_key, params, priority, created_at, expires_at,
  status, shown_at, dismissed_at, helpful, channel
`;

export function sqlStore(): NudgeStore {
  return {
    async insert(draft) {
      await ready();
      const rows = await db()`
        insert into nudges (
          id, user_id, rule_id, rule_version, kind, category, trigger, trigger_key,
          decision, probability, rand_u, message_key, params, priority,
          created_at, expires_at, status, channel
        )
        values (
          ${randomUUID()},
          ${draft.userId},
          ${draft.ruleId},
          ${draft.ruleVersion},
          ${draft.kind},
          ${draft.category},
          ${draft.trigger},
          ${draft.triggerKey},
          ${draft.decision},
          ${draft.probability},
          ${draft.randU},
          ${draft.messageKey},
          ${db().json(numericParams(draft.params))},
          ${draft.priority},
          ${draft.createdAt},
          ${draft.expiresAt},
          ${draft.status},
          ${draft.channel}
        )
        on conflict (user_id, rule_id, rule_version, trigger_key) do nothing
        returning id
      `;
      return rows.length ? "inserted" : "duplicate";
    },
    async listActive(userId, now, limit) {
      await ready();
      const rows = await db()`
        select ${db().unsafe(COLUMNS)}
        from nudges
        where user_id = ${userId}
          and status in ('pending', 'shown')
          and (expires_at is null or expires_at > ${now})
        order by priority asc, created_at desc
        limit ${limit}
      `;
      return rows.map((row) => mapRow(row));
    },
    async history(userId, since) {
      await ready();
      const rows = await db()`
        select ${db().unsafe(COLUMNS)}
        from nudges
        where user_id = ${userId}
          and decision = 'send'
          and status in ('pending', 'shown', 'dismissed')
          and created_at >= ${since}
        order by created_at desc
      `;
      return rows.map((row) => mapRow(row));
    },
    async markShown(userId, nudgeId, now) {
      await ready();
      const updated = await db()`
        update nudges
        set status = 'shown', shown_at = ${now}
        where id = ${nudgeId} and user_id = ${userId} and status = 'pending'
        returning id
      `;
      if (updated.length) {
        return true;
      }
      const existing = await db()`
        select id from nudges
        where id = ${nudgeId} and user_id = ${userId} and status = 'shown'
      `;
      return existing.length > 0;
    },
    async dismiss(userId, nudgeId, helpful, now) {
      await ready();
      const updated = await db()`
        update nudges
        set status = 'dismissed', dismissed_at = ${now}, helpful = ${helpful}
        where id = ${nudgeId}
          and user_id = ${userId}
          and status in ('pending', 'shown')
        returning id
      `;
      return updated.length > 0;
    },
    async expireOld(userId, now) {
      await ready();
      const updated = await db()`
        update nudges
        set status = 'expired'
        where user_id = ${userId}
          and status = 'pending'
          and expires_at is not null
          and expires_at <= ${now}
        returning id
      `;
      return updated.length;
    },
    async readEnabled(userId) {
      await ready();
      const rows = await db()`
        select enabled from nudge_settings where user_id = ${userId}
      `;
      if (!rows.length) {
        return true;
      }
      return Boolean(rows[0].enabled);
    },
    async writeEnabled(userId, enabled) {
      await ready();
      await db()`
        insert into nudge_settings (user_id, enabled, updated_at)
        values (${userId}, ${enabled}, now())
        on conflict (user_id) do update
        set enabled = excluded.enabled, updated_at = now()
      `;
    },
    async hasHealthConsent(userId) {
      await ready();
      const rows = await db()`
        select health_accepted_at from consents
        where user_id = ${userId} and health_accepted_at is not null
      `;
      return rows.length > 0;
    },
    async lastFiredAt(userId, ruleId) {
      await ready();
      const rows = await db()`
        select max(created_at) as at
        from nudges
        where user_id = ${userId} and rule_id = ${ruleId}
      `;
      const at = rows[0]?.at;
      return at ? new Date(at as string | Date) : null;
    },
    async sendsBetween(userId, start, end) {
      await ready();
      const rows = await db()`
        select category, created_at
        from nudges
        where user_id = ${userId}
          and decision = 'send'
          and created_at >= ${start}
          and created_at < ${end}
      `;
      return rows.map((row) => ({
        category: String(row.category ?? ""),
        createdAt: new Date(row.created_at as string | Date),
      }));
    },
    async consentedEnabledMembers() {
      await ready();
      const rows = await db()`
        select m.id::text as id
        from members m
        join consents c on c.user_id = m.id
        left join nudge_settings s on s.user_id = m.id
        where c.health_accepted_at is not null
          and coalesce(s.enabled, true)
      `;
      return rows.map((row) => String(row.id));
    },
  };
}

export type MemoryStore = NudgeStore & {
  rows: NudgeRow[];
  members: string[];
  setConsent(userId: string, value: boolean): void;
  setEnabled(userId: string, value: boolean): void;
};

export function memoryStore(): MemoryStore {
  const rows: NudgeRow[] = [];
  const enabled = new Map<string, boolean>();
  const consent = new Map<string, boolean>();
  const members: string[] = [];

  const store: MemoryStore = {
    rows,
    members,
    setConsent(userId, value) {
      consent.set(userId, value);
    },
    setEnabled(userId, value) {
      enabled.set(userId, value);
    },
    async insert(draft) {
      const exists = rows.some(
        (row) =>
          row.userId === draft.userId &&
          row.ruleId === draft.ruleId &&
          row.ruleVersion === draft.ruleVersion &&
          row.triggerKey === draft.triggerKey,
      );
      if (exists) {
        return "duplicate";
      }
      rows.push({
        ...draft,
        params: numericParams(draft.params),
        id: randomUUID(),
        shownAt: null,
        dismissedAt: null,
        helpful: null,
      });
      return "inserted";
    },
    async listActive(userId, now, limit) {
      return rows
        .filter(
          (row) =>
            row.userId === userId &&
            (row.status === "pending" || row.status === "shown") &&
            row.expiresAt.getTime() > now.getTime(),
        )
        .sort((a, b) => a.priority - b.priority || b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
    async history(userId, since) {
      return rows
        .filter(
          (row) =>
            row.userId === userId &&
            row.decision === "send" &&
            (row.status === "pending" || row.status === "shown" || row.status === "dismissed") &&
            row.createdAt.getTime() >= since.getTime(),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async markShown(userId, nudgeId, now) {
      const row = rows.find((item) => item.id === nudgeId && item.userId === userId);
      if (!row) {
        return false;
      }
      if (row.status === "shown") {
        return true;
      }
      if (row.status !== "pending") {
        return false;
      }
      row.status = "shown";
      row.shownAt = now;
      return true;
    },
    async dismiss(userId, nudgeId, helpful, now) {
      const row = rows.find((item) => item.id === nudgeId && item.userId === userId);
      if (!row || (row.status !== "pending" && row.status !== "shown")) {
        return false;
      }
      row.status = "dismissed";
      row.dismissedAt = now;
      row.helpful = helpful;
      return true;
    },
    async expireOld(userId, now) {
      let count = 0;
      for (const row of rows) {
        if (
          row.userId === userId &&
          row.status === "pending" &&
          row.expiresAt.getTime() <= now.getTime()
        ) {
          row.status = "expired";
          count += 1;
        }
      }
      return count;
    },
    async readEnabled(userId) {
      return enabled.get(userId) !== false;
    },
    async writeEnabled(userId, value) {
      enabled.set(userId, value);
    },
    async hasHealthConsent(userId) {
      return consent.get(userId) !== false;
    },
    async lastFiredAt(userId, ruleId) {
      const times = rows
        .filter((row) => row.userId === userId && row.ruleId === ruleId)
        .map((row) => row.createdAt.getTime());
      if (!times.length) {
        return null;
      }
      return new Date(Math.max(...times));
    },
    async sendsBetween(userId, start, end) {
      return rows
        .filter(
          (row) =>
            row.userId === userId &&
            row.decision === "send" &&
            row.createdAt.getTime() >= start.getTime() &&
            row.createdAt.getTime() < end.getTime(),
        )
        .map((row) => ({ category: row.category, createdAt: row.createdAt }));
    },
    async consentedEnabledMembers() {
      return members.filter(
        (userId) => consent.get(userId) !== false && enabled.get(userId) !== false,
      );
    },
  };
  return store;
}

export function numericParams(params: Record<string, number>): Record<string, number> {
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = value;
    }
  }
  return clean;
}

function mapRow(row: Record<string, unknown>): NudgeRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    ruleId: String(row.rule_id ?? ""),
    ruleVersion: Number(row.rule_version ?? 0),
    kind: String(row.kind ?? ""),
    category: String(row.category ?? ""),
    trigger: String(row.trigger ?? ""),
    triggerKey: String(row.trigger_key),
    decision: row.decision === "hold" ? "hold" : "send",
    probability: Number(row.probability ?? 0),
    randU: Number(row.rand_u ?? 0),
    messageKey: String(row.message_key ?? ""),
    params: numericParams(asParams(row.params)),
    priority: Number(row.priority ?? 0),
    createdAt: asDate(row.created_at),
    expiresAt: asDate(row.expires_at),
    status: asStatus(row.status),
    shownAt: row.shown_at ? asDate(row.shown_at) : null,
    dismissedAt: row.dismissed_at ? asDate(row.dismissed_at) : null,
    helpful: row.helpful === null || row.helpful === undefined ? null : Boolean(row.helpful),
    channel: String(row.channel ?? "in_app"),
  };
}

function asParams(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const params: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number") {
      params[key] = item;
    }
  }
  return params;
}

function asDate(value: unknown) {
  return value instanceof Date ? value : new Date(String(value));
}

function asStatus(value: unknown): NudgeStatus {
  if (
    value === "held" ||
    value === "pending" ||
    value === "shown" ||
    value === "dismissed" ||
    value === "expired"
  ) {
    return value;
  }
  return "pending";
}
