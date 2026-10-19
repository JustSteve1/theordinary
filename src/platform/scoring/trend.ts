import type { PreparedConfig } from "@/src/platform/scoring/config";
import { mulberry32 } from "@/src/platform/scoring/probes";

export type TrendPoint = {
  id: string;
  recordedAt: string;
  lagBand: string | null;
  practice: boolean;
  accuracy: number | null;
  richness: number | null;
  intrusion: number | null;
};

export type BandTrend = {
  key: string;
  counted: number;
  practice: number;
  accuracy: { low: number; median: number; high: number } | null;
  richness: { low: number; mean: number; high: number } | null;
  baseline: number | null;
  nudge: boolean;
};

export function trendBands(points: TrendPoint[], config: PreparedConfig): BandTrend[] {
  const keys = [...config.lagBands.map((band) => band.key)];
  return keys.map((key) => {
    const rows = points.filter((point) => point.lagBand === key);
    const practice = rows.filter((point) => point.practice).length;
    const scored = rows
      .filter((point) => !point.practice)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const accuracyRows = scored.filter((point) => point.accuracy !== null);
    const richnessRows = scored.filter((point) => point.richness !== null);
    const accuracy = accuracyRows.length
      ? accuracyBand(
          accuracyRows.map((point) => point.accuracy ?? 0),
          config,
        )
      : null;
    const richness = richnessRows.length
      ? richnessBand(
          richnessRows.map((point) => point.richness ?? 0),
          config,
        )
      : null;
    const baseline = baselineOf(
      accuracyRows.map((point) => point.accuracy ?? 0),
      config.baselineCheckins,
    );
    const nudge = Boolean(
      baseline !== null &&
        accuracy &&
        (accuracy.high < baseline || accuracy.low > baseline),
    );
    return {
      key,
      counted: scored.length,
      practice,
      accuracy,
      richness,
      baseline,
      nudge,
    };
  });
}

function accuracyBand(values: number[], config: PreparedConfig) {
  const weights = discount(values.length, config.halfLifeCheckins);
  let alpha = config.priorRecall.alpha;
  let beta = config.priorRecall.beta;
  for (let index = 0; index < values.length; index += 1) {
    const weight = weights[index] ?? 0;
    const proportion = Math.min(1, Math.max(0, (values[index] ?? 0) / 100));
    alpha += weight * proportion;
    beta += weight * (1 - proportion);
  }
  const draws = betaDraws(alpha, beta, config.mcDraws, config.seed).map((draw) => draw * 100);
  return quantiles(draws, config.bandQuantiles);
}

function richnessBand(values: number[], config: PreparedConfig) {
  const weights = discount(values.length, config.halfLifeCheckins);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const mean = values.reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0) / total;
  const variance =
    values.reduce((sum, value, index) => {
      const delta = value - mean;
      return sum + (weights[index] ?? 0) * delta * delta;
    }, 0) / total;
  const sd = Math.sqrt(variance);
  const square = weights.reduce((sum, weight) => sum + weight * weight, 0);
  const effective = (total * total) / square;
  const spread = (config.richnessZ * sd) / Math.sqrt(effective);
  return {
    low: round1(mean - spread),
    mean: round1(mean),
    high: round1(mean + spread),
  };
}

function baselineOf(values: number[], needed: number) {
  if (values.length < needed) {
    return null;
  }
  const first = values.slice(0, needed);
  return round1(first.reduce((sum, value) => sum + value, 0) / first.length);
}

function discount(count: number, halfLife: number) {
  const weights: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const age = count - 1 - index;
    weights.push(0.5 ** (age / halfLife));
  }
  return weights;
}

function quantiles(draws: number[], quantilesWanted: [number, number]) {
  const sorted = [...draws].sort((a, b) => a - b);
  const at = (quantile: number) => {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round(quantile * (sorted.length - 1))));
    return round1(sorted[index] ?? 0);
  };
  return { low: at(quantilesWanted[0]), median: at(0.5), high: at(quantilesWanted[1]) };
}

function betaDraws(alpha: number, beta: number, count: number, seed: number) {
  const rand = mulberry32(seed);
  const draws: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const left = gamma(alpha, rand);
    const right = gamma(beta, rand);
    draws.push(left / (left + right));
  }
  return draws;
}

function gamma(shape: number, rand: () => number): number {
  if (shape < 1) {
    return gamma(shape + 1, rand) * rand() ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = 0;
    let v = 0;
    do {
      x = normal(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function normal(rand: () => number) {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function round1(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
