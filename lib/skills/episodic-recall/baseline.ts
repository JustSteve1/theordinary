import type { RecallScore } from "./score";

export const MIN_BASELINE = 5;
const Z_CUT = 1.5;

export type Confounders = {
  poor_sleep?: boolean;
  unwell_or_alcohol?: boolean;
  [key: string]: boolean | undefined;
};

export type TrendFlag =
  | "insufficient_baseline"
  | "within_range"
  | "above_range"
  | "below_range"
  | "review_suggested";

export type Trend = {
  n_prior: number;
  n_prior_clean: number;
  baseline_mean: number | null;
  baseline_sd: number | null;
  z: number | null;
  flag: TrendFlag;
};

export type PriorSession = {
  aborted?: boolean;
  composite: number | null;
  confounders?: Confounders;
  trend?: { z?: number | null };
};

export function trendFor(
  prior: PriorSession[],
  composite: number | null,
  aborted = false,
): Trend {
  const scored = prior.filter(
    (row) =>
      !row.aborted && row.composite !== null && row.composite !== undefined,
  );
  const clean = scored
    .filter((row) => !excluded(row.confounders))
    .map((row) => row.composite as number);
  const trend: Trend = {
    n_prior: scored.length,
    n_prior_clean: clean.length,
    baseline_mean: null,
    baseline_sd: null,
    z: null,
    flag: "insufficient_baseline",
  };
  if (aborted || composite === null || clean.length < MIN_BASELINE) {
    return trend;
  }
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance =
    clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / clean.length;
  const sd = Math.sqrt(variance) || 1;
  const z = (composite - mean) / sd;
  trend.baseline_mean = round(mean, 1);
  trend.baseline_sd = round(sd, 1);
  trend.z = round(z, 2);
  if (z <= -Z_CUT) {
    const last = scored.at(-1);
    const lastZ = last?.trend?.z;
    trend.flag =
      lastZ !== null && lastZ !== undefined && lastZ <= -Z_CUT
        ? "review_suggested"
        : "below_range";
  } else if (z >= Z_CUT) {
    trend.flag = "above_range";
  } else {
    trend.flag = "within_range";
  }
  return trend;
}

export function beeFact(input: {
  date: string;
  window: string;
  aborted?: boolean;
  composite: number | null;
  coreRecall: number | null;
  confounders?: Confounders;
  trend: Trend;
}) {
  if (input.aborted) {
    return `Episodic recall check-in ${input.date} (${input.window}): not completed.`;
  }
  const notes: string[] = [];
  if (input.confounders?.poor_sleep) {
    notes.push("poor sleep");
  }
  if (input.confounders?.unwell_or_alcohol) {
    notes.push("unwell/alcohol");
  }
  const comparison =
    input.trend.z === null
      ? `, baseline ${input.trend.n_prior_clean}/${MIN_BASELINE}`
      : `, z=${input.trend.z >= 0 ? "+" : ""}${input.trend.z.toFixed(2)} vs own baseline`;
  const suffix = notes.length ? ` [${notes.join(", ")}]` : "";
  return `Episodic recall check-in ${input.date} (${input.window}): composite ${input.composite}/100, core recall ${input.coreRecall}${comparison}, flag=${input.trend.flag}${suffix}.`;
}

export function resultFromScore(
  score: RecallScore,
  prior: PriorSession[],
  confounders: Confounders,
) {
  const trend = trendFor(prior, score.composite, false);
  return {
    aborted: false,
    composite: score.composite,
    core_recall: score.core_recall,
    detail_recall: score.detail_recall,
    intrusion_rate: score.intrusion_rate,
    unsure_rate: score.unsure_rate,
    n_truth: score.n_truth,
    n_core: score.n_core,
    n_recall: score.n_recall,
    per_type_recall: score.per_type_recall,
    confounders,
    trend,
    bee_fact: beeFact({
      date: score.date ?? "",
      window: score.window ?? "",
      composite: score.composite,
      coreRecall: score.core_recall,
      confounders,
      trend,
    }),
  };
}

export type LoggedScore = ReturnType<typeof resultFromScore>;

function excluded(confounders: Confounders | undefined) {
  return Boolean(confounders?.poor_sleep || confounders?.unwell_or_alcohol);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
