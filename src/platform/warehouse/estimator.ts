export type FrameRow = {
  member: string;
  block: string;
  a: number;
  p: number;
  y: number | null;
  response?: string | null;
};

export type EffectEstimate = {
  status: "ok" | "insufficient_data";
  beta: number | null;
  nDecisions: number;
  nTreated: number;
  nWithOutcome: number;
  meanTreated: number | null;
  meanControl: number | null;
  adherence: number | null;
  p025: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  p975: number | null;
  probPositive: number | null;
};

function hashText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function bootstrapWeight(block: string, rep: number, experimentId = "exp") {
  const bucket = ((hashText(`${block}|${rep}|${experimentId}`) % 1_000_000) + 0.5) / 1_000_000;
  return -Math.log(bucket);
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) {
    return null;
  }
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

export function estimateEffect(
  rows: FrameRow[],
  options: { reps?: number; direction?: "increase" | "decrease"; experimentId?: string } = {},
): EffectEstimate {
  const reps = options.reps ?? 2000;
  const direction = options.direction ?? "increase";
  const sign = direction === "decrease" ? -1 : 1;
  const usable = rows.filter(
    (row): row is FrameRow & { y: number } => row.y !== null && row.p > 0 && row.p < 1,
  );
  const nDecisions = rows.length;
  const nWithOutcome = usable.length;
  const nTreated = usable.filter((row) => row.a === 1).length;
  const treated = usable.filter((row) => row.a === 1).map((row) => row.y);
  const control = usable.filter((row) => row.a === 0).map((row) => row.y);
  const done = usable.filter((row) => row.a === 1 && row.response === "done").length;
  const empty: EffectEstimate = {
    status: "insufficient_data",
    beta: null,
    nDecisions,
    nTreated,
    nWithOutcome,
    meanTreated: mean(treated),
    meanControl: mean(control),
    adherence: nTreated === 0 ? null : done / nTreated,
    p025: null,
    p10: null,
    p50: null,
    p90: null,
    p975: null,
    probPositive: null,
  };
  if (nWithOutcome < 14) {
    return empty;
  }
  const pTilde = mean(usable.map((row) => row.p)) ?? 0;
  const weight = (row: FrameRow) =>
    row.a === 1 ? pTilde / row.p : (1 - pTilde) / (1 - row.p);
  const memberWeight = new Map<string, number>();
  const memberValue = new Map<string, number>();
  for (const row of usable) {
    const w = weight(row);
    memberWeight.set(row.member, (memberWeight.get(row.member) ?? 0) + w);
    memberValue.set(row.member, (memberValue.get(row.member) ?? 0) + w * row.y);
  }
  const centred = usable.map((row) => {
    const total = memberWeight.get(row.member) ?? 0;
    const centre = total === 0 ? 0 : (memberValue.get(row.member) ?? 0) / total;
    return { ...row, w: weight(row), yc: row.y - centre };
  });
  const betaOf = (rep: number | null) => {
    let numerator = 0;
    let denominator = 0;
    for (const row of centred) {
      const g = rep === null ? 1 : bootstrapWeight(row.block, rep, options.experimentId);
      numerator += row.w * g * (row.a - pTilde) * row.yc;
      denominator += row.w * g * (row.a - pTilde) ** 2;
    }
    return denominator === 0 ? null : (numerator / denominator) * sign;
  };
  const point = betaOf(null);
  const draws: number[] = [];
  for (let rep = 1; rep <= reps; rep += 1) {
    const draw = betaOf(rep);
    if (draw !== null) {
      draws.push(draw);
    }
  }
  draws.sort((left, right) => left - right);
  return {
    status: "ok",
    beta: point,
    nDecisions,
    nTreated,
    nWithOutcome,
    meanTreated: mean(treated),
    meanControl: mean(control),
    adherence: nTreated === 0 ? null : done / nTreated,
    p025: percentile(draws, 0.025),
    p10: percentile(draws, 0.1),
    p50: percentile(draws, 0.5),
    p90: percentile(draws, 0.9),
    p975: percentile(draws, 0.975),
    probPositive: draws.length === 0 ? null : draws.filter((value) => value > 0).length / draws.length,
  };
}

function mean(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function syntheticFrame(effect: number, seed = 7) {
  const random = mulberry32(seed);
  const rows: FrameRow[] = [];
  for (const member of ["m1", "m2", "m3"]) {
    let noise = 0;
    for (let day = 0; day < 120; day += 1) {
      const shock = normal(random) * 8;
      noise = 0.5 * noise + shock;
      const a = random() < 0.5 ? 1 : 0;
      rows.push({
        member,
        block: `${member}:${Math.floor(day / 3)}`,
        a,
        p: 0.5,
        y: noise + effect * a,
        response: a === 1 ? "done" : null,
      });
    }
  }
  return rows;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number) {
  const u1 = Math.max(random(), 1e-12);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
