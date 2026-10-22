import { db, ready } from "@/src/platform/db";
import type { Trigger } from "@/src/platform/nudges/rules";
import { londonIsoWeek } from "@/src/platform/nudges/time";
import type { SignalContext, SignalSource } from "@/src/platform/nudges/signals/types";

export function experimentMetrics(doneThisWeek: number) {
  return { experiment_done_this_week: doneThisWeek };
}

export const experimentsSource: SignalSource = {
  id: "experiments",
  triggers: ["experiment_done"] satisfies Trigger[],
  async metrics(ctx: SignalContext) {
    const week = londonIsoWeek(ctx.now);
    await ready();
    const rows = await db()`
      select count(*)::int as n
      from decision_points
      where user_id = ${ctx.userId}
        and response = 'done'
        and responded_at >= ${week.start}
        and responded_at < ${week.end}
    `;
    return experimentMetrics(Number(rows[0]?.n ?? 0));
  },
};
