import { randomUUID } from "crypto";

import type {
  Confounders,
  LoggedScore,
  Trend,
} from "@/lib/skills/episodic-recall/baseline";
import type { Phase } from "@/lib/skills/episodic-recall/machine";
import type {
  GroundTruth,
  RecallScore,
} from "@/lib/skills/episodic-recall/score";
import type { WindowName } from "@/lib/skills/episodic-recall/window";
import { db, ready } from "@/lib/db";
import { skills, type SkillId } from "@/lib/skills/registry";

export type StoredWindow = {
  date: string;
  tz: string;
  window: WindowName;
  window_start: string;
  window_end: string;
  n_conversations: number;
  total_minutes: number;
  conversation_ids: Array<number | string>;
};

export type StoredSession = {
  id: string;
  userId: string;
  skill: SkillId;
  phase: Phase;
  targetDate: string | null;
  timezone: string;
  confounders: Confounders | null;
  window: StoredWindow | null;
  recallRaw: string;
  groundTruth: GroundTruth | null;
  revealItems: Array<{ type: string; text: string }>;
};

export type StoredResult = {
  id: string;
  aborted: boolean;
  composite: number | null;
  coreRecall: number | null;
  detailRecall: number | null;
  intrusionRate: number | null;
  unsureRate: number | null;
  nTruth: number | null;
  nCore: number | null;
  nRecall: number | null;
  perTypeRecall: RecallScore["per_type_recall"] | null;
  confounders: Confounders | null;
  trend: Trend | null;
  beeFact: string | null;
  window: string | null;
  targetDate: string | null;
};

const SKILL: SkillId = "episodic-recall";

export async function openSkillSession(userId: string) {
  await ready();
  const rows = await db()`
    select id
    from skill_sessions
    where user_id = ${userId}
      and skill = ${SKILL}
      and phase in (
        'consent',
        'confounders',
        'awaiting_capture',
        'recall',
        'followup_1',
        'followup_2',
        'feedback'
      )
    limit 1
  `;
  return rows[0]?.id ?? null;
}

export async function createSkillSession(userId: string, timezone: string) {
  await ready();
  const id = randomUUID();
  await db()`
    insert into skill_sessions (id, user_id, skill, phase, timezone)
    values (${id}, ${userId}, ${SKILL}, ${"consent"}, ${timezone})
  `;
  return id;
}

export async function loadSkillSession(id: string, userId?: string) {
  await ready();
  const rows = userId
    ? await db()`
        select
          s.id,
          s.user_id,
          s.phase,
          s.target_date::text as target_date,
          s.timezone,
          s.confounders,
          s.window,
          w.recall_raw,
          w.ground_truth,
          w.reveal_items
        from skill_sessions s
        left join skill_work w on w.session_id = s.id
        where s.id = ${id} and s.user_id = ${userId} and s.skill = ${SKILL}
        limit 1
      `
    : await db()`
        select
          s.id,
          s.user_id,
          s.phase,
          s.target_date::text as target_date,
          s.timezone,
          s.confounders,
          s.window,
          w.recall_raw,
          w.ground_truth,
          w.reveal_items
        from skill_sessions s
        left join skill_work w on w.session_id = s.id
        where s.id = ${id} and s.skill = ${SKILL}
        limit 1
      `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return mapSession(row);
}

export async function savePhase(
  id: string,
  phase: Phase,
  extra?: {
    targetDate?: string | null;
    confounders?: Confounders | null;
    window?: StoredWindow | null;
  },
) {
  await ready();
  await db().begin(async (sql) => {
    await sql`
      update skill_sessions
      set phase = ${phase}, updated_at = now()
      where id = ${id}
    `;
    if (extra?.targetDate) {
      await sql`
        update skill_sessions
        set target_date = ${extra.targetDate}
        where id = ${id}
      `;
    }
    if (extra?.confounders) {
      await sql`
        update skill_sessions
        set confounders = ${sql.json(extra.confounders)}
        where id = ${id}
      `;
    }
    if (extra?.window) {
      await sql`
        update skill_sessions
        set window = ${sql.json(extra.window)}
        where id = ${id}
      `;
    }
  });
}

export async function saveGroundTruth(
  id: string,
  groundTruth: GroundTruth,
  window: StoredWindow,
) {
  await ready();
  await db().begin(async (sql) => {
    await sql`
      insert into skill_work (session_id, ground_truth, recall_raw, reveal_items)
      values (${id}, ${sql.json(groundTruth)}, ${""}, ${null})
      on conflict (session_id) do update set
        ground_truth = excluded.ground_truth,
        recall_raw = '',
        reveal_items = null
    `;
    await sql`
      update skill_sessions
      set phase = ${"recall"}, window = ${sql.json(window)}, updated_at = now()
      where id = ${id}
    `;
  });
}

export async function saveRecallRaw(
  id: string,
  phase: Phase,
  recallRaw: string,
) {
  await ready();
  await db().begin(async (sql) => {
    await sql`
      update skill_work
      set recall_raw = ${recallRaw}
      where session_id = ${id}
    `;
    await sql`
      update skill_sessions
      set phase = ${phase}, updated_at = now()
      where id = ${id}
    `;
  });
}

export async function completeScore(input: {
  sessionId: string;
  userId: string;
  targetDate: string;
  window: string;
  conversationIds: Array<number | string>;
  result: LoggedScore;
  reveal: Array<{ type: string; text: string }>;
}) {
  await ready();
  const resultId = randomUUID();
  const outboxId = randomUUID();
  await db().begin(async (sql) => {
    await sql`
      insert into skill_results (
        id, user_id, session_id, skill, target_date, window, conversation_ids,
        aborted, composite, core_recall, detail_recall, intrusion_rate, unsure_rate,
        n_truth, n_core, n_recall, per_type_recall, confounders, trend, bee_fact
      )
      values (
        ${resultId},
        ${input.userId},
        ${input.sessionId},
        ${SKILL},
        ${input.targetDate},
        ${input.window},
        ${sql.json(input.conversationIds)},
        ${false},
        ${input.result.composite},
        ${input.result.core_recall},
        ${input.result.detail_recall},
        ${input.result.intrusion_rate},
        ${input.result.unsure_rate},
        ${input.result.n_truth},
        ${input.result.n_core},
        ${input.result.n_recall},
        ${sql.json(input.result.per_type_recall)},
        ${sql.json(input.result.confounders)},
        ${sql.json(input.result.trend)},
        ${input.result.bee_fact}
      )
    `;
    await sql`
      insert into skill_outbox (id, user_id, session_id, skill, body)
      values (
        ${outboxId},
        ${input.userId},
        ${input.sessionId},
        ${SKILL},
        ${input.result.bee_fact}
      )
    `;
    await sql`
      update skill_work
      set ground_truth = null, recall_raw = '', reveal_items = ${sql.json(input.reveal)}
      where session_id = ${input.sessionId}
    `;
    await sql`
      update skill_sessions
      set phase = ${"feedback"}, updated_at = now()
      where id = ${input.sessionId}
    `;
  });
}

export async function takeReveal(id: string) {
  await ready();
  const rows = await db()`
    select reveal_items
    from skill_work
    where session_id = ${id}
    limit 1
  `;
  const items = arrayOf(rows[0]?.reveal_items);
  await db().begin(async (sql) => {
    await sql`delete from skill_work where session_id = ${id}`;
    await sql`
      update skill_sessions
      set phase = ${"complete"}, updated_at = now()
      where id = ${id}
    `;
  });
  return items;
}

export async function abortSession(input: {
  sessionId: string;
  userId: string;
  targetDate: string | null;
  window: string | null;
  conversationIds: Array<number | string>;
}) {
  await ready();
  await db().begin(async (sql) => {
    await sql`delete from skill_work where session_id = ${input.sessionId}`;
    await sql`
      insert into skill_results (
        id, user_id, session_id, skill, target_date, window, conversation_ids,
        aborted, composite, bee_fact
      )
      values (
        ${randomUUID()},
        ${input.userId},
        ${input.sessionId},
        ${SKILL},
        ${input.targetDate},
        ${input.window},
        ${sql.json(input.conversationIds)},
        ${true},
        ${null},
        ${null}
      )
    `;
    await sql`
      update skill_sessions
      set phase = ${"aborted"}, updated_at = now()
      where id = ${input.sessionId}
    `;
  });
}

export async function closeSession(
  id: string,
  phase: "declined" | "ineligible",
) {
  await ready();
  await db().begin(async (sql) => {
    await sql`delete from skill_work where session_id = ${id}`;
    await sql`
      update skill_sessions
      set phase = ${phase}, updated_at = now()
      where id = ${id}
    `;
  });
}

export async function priorResults(userId: string): Promise<
  Array<{
    aborted: boolean;
    composite: number | null;
    confounders: Confounders;
    trend: Trend;
  }>
> {
  await ready();
  const rows = await db()`
    select aborted, composite, confounders, trend
    from skill_results
    where user_id = ${userId} and skill = ${SKILL}
    order by recorded_at asc
  `;
  return rows.map((row) => ({
    aborted: Boolean(row.aborted),
    composite: numberOrNull(row.composite),
    confounders: (row.confounders ?? {}) as Confounders,
    trend: (row.trend ?? {}) as Trend,
  }));
}

export async function latestResult(
  sessionId: string,
): Promise<StoredResult | null> {
  await ready();
  const rows = await db()`
    select
      id,
      aborted,
      composite,
      core_recall,
      detail_recall,
      intrusion_rate,
      unsure_rate,
      n_truth,
      n_core,
      n_recall,
      per_type_recall,
      confounders,
      trend,
      bee_fact,
      window,
      target_date::text as target_date
    from skill_results
    where session_id = ${sessionId}
    order by recorded_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: String(row.id),
    aborted: Boolean(row.aborted),
    composite: numberOrNull(row.composite),
    coreRecall: numberOrNull(row.core_recall),
    detailRecall: numberOrNull(row.detail_recall),
    intrusionRate: numberOrNull(row.intrusion_rate),
    unsureRate: numberOrNull(row.unsure_rate),
    nTruth: numberOrNull(row.n_truth),
    nCore: numberOrNull(row.n_core),
    nRecall: numberOrNull(row.n_recall),
    perTypeRecall: (row.per_type_recall ??
      null) as StoredResult["perTypeRecall"],
    confounders: (row.confounders ?? null) as Confounders | null,
    trend: (row.trend ?? null) as Trend | null,
    beeFact: stringOrNull(row.bee_fact),
    window: stringOrNull(row.window),
    targetDate: stringOrNull(row.target_date),
  };
}

export async function awaitingCapture(userId: string) {
  await ready();
  const rows = await db()`
    select id, target_date::text as target_date, timezone
    from skill_sessions
    where user_id = ${userId}
      and skill = ${SKILL}
      and phase = ${"awaiting_capture"}
    order by created_at asc
  `;
  return rows.map((row) => ({
    session_id: String(row.id),
    date: String(row.target_date),
    timezone: String(row.timezone),
  }));
}

export async function pendingFacts(userId: string) {
  await ready();
  const rows = await db()`
    select id, body
    from skill_outbox
    where user_id = ${userId} and skill = ${SKILL} and acked_at is null
    order by created_at asc
  `;
  return rows.map((row) => ({ id: String(row.id), text: String(row.body) }));
}

export async function ackFacts(userId: string, ids: string[]) {
  await ready();
  if (ids.length === 0) {
    return 0;
  }
  const rows = await db()`
    update skill_outbox
    set acked_at = now()
    where user_id = ${userId}
      and skill = ${SKILL}
      and acked_at is null
      and id in ${db()(ids)}
    returning id
  `;
  return rows.length;
}

export function skillName() {
  return skills[SKILL].title;
}

function mapSession(row: Record<string, unknown>): StoredSession {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    skill: SKILL,
    phase: String(row.phase) as Phase,
    targetDate: stringOrNull(row.target_date),
    timezone: String(row.timezone),
    confounders: (row.confounders ?? null) as Confounders | null,
    window: (row.window ?? null) as StoredWindow | null,
    recallRaw: typeof row.recall_raw === "string" ? row.recall_raw : "",
    groundTruth: (row.ground_truth ?? null) as GroundTruth | null,
    revealItems: arrayOf(row.reveal_items),
  };
}

function arrayOf(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const text = stringOrNull(record.text);
    const type = stringOrNull(record.type);
    return text && type ? [{ type, text }] : [];
  });
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (
    typeof value === "string" &&
    value.trim() &&
    !Number.isNaN(Number(value))
  ) {
    return Number(value);
  }
  return null;
}
