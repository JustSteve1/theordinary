import type { BeeSnapshot } from "@/lib/integrations/bee/client";
import type {
  WhoopScore,
  WhoopSnapshot,
} from "@/lib/integrations/whoop/client";

export const WEEK_GOAL = 100;

export type Tier = "Member" | "Silver" | "Gold" | "Black";

export type LedgerRow = {
  label: string;
  detail: string;
  points: number;
};

const CONVERSATION_POINTS = 40;
const DAILY_POINTS = 30;
const RECOVERY_HIGH_POINTS = 40;
const RECOVERY_MID_POINTS = 15;
const STRAIN_POINTS = 25;

export function scoreMembership(input: {
  now: number;
  timeZone: string;
  bee: BeeSnapshot;
  whoop: WhoopSnapshot;
}): { points: number; tier: Tier; ledger: LedgerRow[] } {
  const timeZone = input.timeZone || "Europe/London";
  const week = weekDateKeys(input.now, timeZone);
  const today = dateKey(input.now, timeZone);
  const ledger: LedgerRow[] = [];

  if (input.bee.status === "ok") {
    const conversationDays = new Set<string>();
    for (const conversation of input.bee.conversations) {
      const day = dateKey(conversation.startMs, timeZone);
      if (!week.has(day) || conversationDays.has(day)) {
        continue;
      }
      conversationDays.add(day);
      ledger.push({
        label: "Conversation",
        detail:
          day === today
            ? conversation.summary
            : `${conversation.summary} · ${day}`,
        points: CONVERSATION_POINTS,
      });
    }

    const dailyDays = new Set<string>();
    for (const daily of input.bee.dailies) {
      const day = dateKey(daily.atMs, timeZone);
      if (!week.has(day) || dailyDays.has(day)) {
        continue;
      }
      dailyDays.add(day);
      ledger.push({
        label: "Daily summary",
        detail: day === today ? "Knowing the day" : `Knowing ${day}`,
        points: DAILY_POINTS,
      });
    }
  }

  if (input.whoop.status === "ok") {
    pushWhoopDays(
      ledger,
      "Recovery",
      input.whoop.recovery,
      recoveryPoints,
      week,
      timeZone,
      today,
    );
    pushWhoopDays(
      ledger,
      "Sleep",
      input.whoop.sleep,
      sleepPoints,
      week,
      timeZone,
      today,
    );
    pushWhoopDays(
      ledger,
      "Strain",
      input.whoop.strain,
      strainPoints,
      week,
      timeZone,
      today,
    );
  }

  const points = ledger.reduce((sum, row) => sum + row.points, 0);
  return { points, tier: tierFor(points), ledger };
}

export function tierFor(points: number): Tier {
  if (points >= WEEK_GOAL) {
    return "Black";
  }
  if (points >= 60) {
    return "Gold";
  }
  if (points >= 30) {
    return "Silver";
  }
  return "Member";
}

function pushWhoopDays(
  ledger: LedgerRow[],
  label: string,
  scores: WhoopScore[],
  pointsFor: (score: WhoopScore) => number,
  week: Set<string>,
  timeZone: string,
  today: string,
) {
  const seen = new Set<string>();
  for (const score of scores) {
    const day = score.atMs === null ? null : dateKey(score.atMs, timeZone);
    if (day && !week.has(day)) {
      continue;
    }
    const key = day ?? `${label}-undated`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const pending = score.state === "PENDING_SCORE";
    const unscored = score.state === "UNSCORABLE" || score.state === "";
    const detail = pending
      ? `${label} is still scoring`
      : unscored
        ? `${label} could not be scored`
        : score.detail;
    ledger.push({
      label,
      detail: day && day !== today ? `${detail} · ${day}` : detail,
      points: pending || unscored ? 0 : pointsFor(score),
    });
  }
}

function recoveryPoints(score: WhoopScore) {
  if (score.value === null) {
    return 0;
  }
  if (score.value >= 67) {
    return RECOVERY_HIGH_POINTS;
  }
  if (score.value >= 34) {
    return RECOVERY_MID_POINTS;
  }
  return 0;
}

function sleepPoints(score: WhoopScore) {
  if (score.value === null) {
    return 0;
  }
  return Math.min(30, Math.round(score.value * 0.3));
}

function strainPoints(score: WhoopScore) {
  if (score.value === null || score.value <= 0) {
    return 0;
  }
  return STRAIN_POINTS;
}

export function dateKey(ms: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}

function weekDateKeys(now: number, timeZone: string) {
  const keys = new Set<string>();
  const today = dateKey(now, timeZone);
  const offset = weekdayFromMonday(now, timeZone);
  let cursor = now;
  keys.add(today);
  for (let step = 0; keys.size <= offset && step < 20; step += 1) {
    cursor -= 12 * 60 * 60 * 1000;
    const key = dateKey(cursor, timeZone);
    if (key > today) {
      continue;
    }
    keys.add(key);
  }
  return keys;
}

function weekdayFromMonday(ms: number, timeZone: string) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(ms);
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const index = order.indexOf(weekday);
  return index === -1 ? 0 : index;
}
