import { recallDefaults } from "@/src/platform/recall/defaults";
import type { SessionRecord, TrendFlag } from "@/src/platform/recall/types";

export function rangeLabel(flag: TrendFlag) {
  if (flag === "above_range") {
    return "Above your usual range";
  }
  if (flag === "below_range" || flag === "review_suggested") {
    return "Below your usual range";
  }
  if (flag === "within_range") {
    return "In your usual range";
  }
  return "Baseline still building";
}

export function cleanSessions(sessions: SessionRecord[]) {
  return sessions.filter(
    (session) =>
      !session.aborted &&
      !session.practice &&
      session.composite !== null &&
      !session.confounders.poorSleep &&
      !session.confounders.unwellOrAlcohol,
  );
}

export function trendFor(
  prior: SessionRecord[],
  composite: number,
): SessionRecord["trend"] {
  const completed = prior.filter(
    (session) => !session.aborted && !session.practice && session.composite !== null,
  );
  const clean = cleanSessions(prior);
  const baseline = clean.slice(-recallDefaults.minBaseline);
  const nPriorClean = clean.length;

  if (nPriorClean < recallDefaults.minBaseline) {
    return {
      nPrior: completed.length,
      nPriorClean,
      baselineMean: null,
      baselineSd: null,
      z: null,
      flag: "insufficient_baseline",
    };
  }

  const mean =
    baseline.reduce((sum, session) => sum + (session.composite ?? 0), 0) /
    baseline.length;
  const variance =
    baseline.reduce((sum, session) => {
      const delta = (session.composite ?? 0) - mean;
      return sum + delta * delta;
    }, 0) / baseline.length;
  const sd = Math.sqrt(variance);
  const z = sd === 0 ? 0 : (composite - mean) / sd;
  let flag: TrendFlag = "within_range";
  if (z > 1.5) {
    flag = "above_range";
  } else if (z < -1.5) {
    flag = "below_range";
  }

  const previous = [...completed].reverse().find((session) => session.trend);
  if (
    flag === "below_range" &&
    previous &&
    (previous.trend.flag === "below_range" ||
      previous.trend.flag === "review_suggested")
  ) {
    flag = "review_suggested";
  }

  return {
    nPrior: completed.length,
    nPriorClean,
    baselineMean: round(mean),
    baselineSd: round(sd),
    z: round(z),
    flag,
  };
}

export function buildSession(input: {
  id: string;
  now: Date;
  date: string;
  poorSleep: boolean;
  unwell: boolean;
  prior: SessionRecord[];
}): SessionRecord {
  const composite = input.poorSleep || input.unwell ? 58 : 72;
  return {
    id: input.id,
    recordedAt: input.now.toISOString(),
    date: input.date,
    window: recallDefaults.scoringWindow,
    aborted: false,
    composite,
    coreRecall: input.poorSleep || input.unwell ? 0.62 : 0.8,
    detailRecall: 0.4,
    intrusionRate: 0.08,
    confounders: {
      poorSleep: input.poorSleep,
      unwellOrAlcohol: input.unwell,
    },
    trend: trendFor(input.prior, composite),
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
