import { recallDefaults } from "@/lib/recall/defaults";
import type { SessionRecord, TrendFlag } from "@/lib/recall/types";
import { trendFor } from "@/lib/recall/trend";

export const fixtureCounts = [0, 3, 5, 12] as const;

export type FixtureCount = (typeof fixtureCounts)[number];

export function isFixtureCount(value: string | undefined): value is `${FixtureCount}` {
  return value === "0" || value === "3" || value === "5" || value === "12";
}

export function fixtureSessions(count: FixtureCount): SessionRecord[] {
  const sessions: SessionRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const day = index + 1;
    const date = `2026-10-${String(day).padStart(2, "0")}`;
    const poorSleep = count === 12 && index === 1;
    const low = count === 12 && index >= count - 2;
    const composite = low ? 40 : poorSleep ? 60 : 70 + (index % 3);
    const prior = sessions.filter((session) => !session.aborted);
    const trend = trendFor(prior, composite);
    let flag: TrendFlag = trend.flag;
    if (count === 12 && index === count - 1 && prior.length >= recallDefaults.minBaseline) {
      flag = "review_suggested";
    }
    sessions.push({
      id: `fixture-${count}-${index}`,
      recordedAt: `${date}T09:00:00.000Z`,
      date,
      window: recallDefaults.scoringWindow,
      aborted: false,
      composite,
      coreRecall: 0.7,
      detailRecall: 0.4,
      intrusionRate: 0.1,
      confounders: { poorSleep, unwellOrAlcohol: false },
      trend: { ...trend, flag },
    });
  }
  return sessions;
}
