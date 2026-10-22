import { db, ready } from "@/src/platform/db";
import type { Trigger } from "@/src/platform/nudges/rules";
import type { SignalContext, SignalSource } from "@/src/platform/nudges/signals/types";

export type MoodSample = { mood: number | null };

/** Rows arrive newest first. The first row is tonight's tap. */
export function moodMetrics(rows: MoodSample[]): Record<string, number> {
  const latestIndex = rows.findIndex((row) => isMood(row.mood));
  if (latestIndex < 0) {
    return {};
  }
  const latest = rows[latestIndex].mood as number;
  const previous: number[] = [];
  for (const row of rows.slice(latestIndex + 1)) {
    if (!isMood(row.mood)) continue;
    previous.push(row.mood as number);
    if (previous.length === 14) break;
  }
  const metrics: Record<string, number> = { mood_today: latest, recent_moods: previous.length };
  if (previous.length > 0) {
    const mean = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    metrics.mood_vs_recent = Math.round((latest - mean) * 10) / 10;
  }
  return metrics;
}

export const moodSource: SignalSource = {
  id: "mood",
  triggers: ["mood_saved"] satisfies Trigger[],
  async metrics(ctx: SignalContext) {
    await ready();
    const rows = await db()`
      select mood
      from recall_sessions
      where user_id = ${ctx.userId}
        and mood is not null
      order by mood_at desc nulls last, recorded_at desc
      limit 15
    `;
    return moodMetrics(rows.map((row) => ({ mood: asMood(row.mood) })));
  },
};

function isMood(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asMood(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
