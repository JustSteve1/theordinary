import { db, ready } from "@/src/platform/db";
import { dateKey } from "@/src/platform/recall/dates";
import type { Trigger } from "@/src/platform/nudges/rules";
import { addCalendarDays } from "@/src/platform/nudges/time";
import type { SignalContext, SignalSource } from "@/src/platform/nudges/signals/types";

export type RichnessSample = {
  richness: number | null;
  practice: boolean;
};

export function checkinStreakDays(dates: string[], today: string) {
  const unique = new Set(dates.map((date) => date.slice(0, 10)));
  if (!unique.has(today)) {
    return 0;
  }
  let count = 0;
  let cursor = today;
  while (unique.has(cursor)) {
    count += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return count;
}

export function richnessMetrics(rows: RichnessSample[]) {
  const latestIndex = rows.findIndex(
    (row) => typeof row.richness === "number" && Number.isFinite(row.richness),
  );
  if (latestIndex < 0) {
    return {};
  }
  const latest = rows[latestIndex].richness;
  if (typeof latest !== "number") {
    return {};
  }
  const previous: number[] = [];
  for (const row of rows.slice(latestIndex + 1)) {
    if (row.practice || typeof row.richness !== "number" || !Number.isFinite(row.richness)) {
      continue;
    }
    previous.push(row.richness);
    if (previous.length === 14) {
      break;
    }
  }
  const metrics: Record<string, number> = { recent_scored_checkins: previous.length };
  if (previous.length > 0) {
    const mean = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    metrics.richness_vs_recent = latest - mean;
  }
  return metrics;
}

export function checkinMetrics(
  dates: string[],
  rows: RichnessSample[],
  today: string,
): Record<string, number> {
  return {
    checkin_streak_days: checkinStreakDays(dates, today),
    ...richnessMetrics(rows),
  };
}

export const checkinsSource: SignalSource = {
  id: "checkins",
  triggers: ["checkin_saved"] satisfies Trigger[],
  async metrics(ctx: SignalContext) {
    const today = dateKey(ctx.now.getTime());
    const [dates, rows] = await Promise.all([
      loadSessionDates(ctx.userId, today),
      loadRichness(ctx.userId),
    ]);
    return checkinMetrics(dates, rows, today);
  },
};

async function loadSessionDates(userId: string, today: string) {
  await ready();
  const rows = await db()`
    select distinct session_date::text as session_date
    from recall_sessions
    where user_id = ${userId}
      and aborted = false
      and session_date <= ${today}::date
  `;
  return rows.map((row) => String(row.session_date).slice(0, 10));
}

async function loadRichness(userId: string): Promise<RichnessSample[]> {
  await ready();
  const rows = await db()`
    select richness, practice
    from (
      select distinct on (c.id)
        c.recorded_at,
        coalesce(s.practice, false) as practice,
        nullif(r.payload->'metrics'->>'richness', '')::double precision as richness
      from score_runs r
      join checkins c on c.id = r.checkin_id
      left join recall_sessions s on s.id = c.id
      where c.user_id = ${userId}
        and r.scorer_version = '2.0.0'
      order by c.id, r.computed_at desc
    ) scored
    order by recorded_at desc
  `;
  return rows.map((row) => ({
    richness: asNumber(row.richness),
    practice: Boolean(row.practice),
  }));
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
