export const FACT_TYPES = [
  "activity",
  "decision",
  "object",
  "person",
  "place",
  "quantity",
  "time",
  "topic",
] as const;

export type FactType = (typeof FACT_TYPES)[number];

const STOP = new Set([
  "the",
  "a",
  "an",
  "my",
  "our",
  "his",
  "her",
  "their",
  "some",
  "that",
  "this",
]);

export type TruthFact = {
  id: string;
  type: FactType;
  text: string;
  aliases?: string[];
  salience: "core" | "detail";
  conversation_id?: number;
  approx_time?: string;
};

export type GroundTruth = {
  date?: string;
  window?: string;
  window_start?: string;
  window_end?: string;
  conversation_ids?: Array<number | string>;
  facts: TruthFact[];
};

export type RecallFact = {
  id: string;
  type: FactType;
  text: string;
  confidence?: "certain" | "unsure";
};

export type RecallDoc = {
  date?: string;
  window?: string;
  raw_text_file?: string;
  facts: RecallFact[];
};

export type ScoreMatch = {
  recall_id: string;
  truth_id: string;
  similarity: number;
  via: "text" | "alias";
};

export type ScoreMiss = {
  truth_id: string;
  salience: "core" | "detail";
  type: FactType;
  text?: string;
};

export type RecallScore = {
  date?: string;
  window?: string;
  n_truth: number;
  n_core: number;
  n_recall: number;
  core_recall: number | null;
  detail_recall: number | null;
  overall_recall: number | null;
  intrusion_rate: number;
  unsure_rate: number;
  per_type_recall: Partial<Record<FactType, number>>;
  composite: number;
  thresholds: { same_type: number; cross_type: number };
  matches: ScoreMatch[];
  misses: ScoreMiss[];
  intrusions: { recall_id: string; type: FactType; text: string }[];
};

export function normalise(value: string) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "");
  const tokens = ascii
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP.has(token));
  return tokens.join(" ");
}

export function sequenceRatio(left: string, right: string) {
  const length = left.length + right.length;
  if (!length) {
    return 1;
  }
  return (2 * matchSize(left, right)) / length;
}

function matchSize(left: string, right: string) {
  const queue: Array<[number, number, number, number]> = [
    [0, left.length, 0, right.length],
  ];
  const blocks: Array<[number, number, number]> = [];
  while (queue.length > 0) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const found = longestMatch(left, right, alo, ahi, blo, bhi);
    if (found.size === 0) {
      continue;
    }
    blocks.push([found.startA, found.startB, found.size]);
    if (alo < found.startA && blo < found.startB) {
      queue.push([alo, found.startA, blo, found.startB]);
    }
    if (found.startA + found.size < ahi && found.startB + found.size < bhi) {
      queue.push([
        found.startA + found.size,
        ahi,
        found.startB + found.size,
        bhi,
      ]);
    }
  }
  blocks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let size = 0;
  let indexA = 0;
  let indexB = 0;
  let run = 0;
  for (const [nextA, nextB, nextRun] of blocks) {
    if (indexA + run === nextA && indexB + run === nextB) {
      run += nextRun;
    } else {
      size += run;
      indexA = nextA;
      indexB = nextB;
      run = nextRun;
    }
  }
  return size + run;
}

function longestMatch(
  left: string,
  right: string,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
) {
  const lengths = new Map<number, number>();
  let startA = alo;
  let startB = blo;
  let size = 0;
  for (let i = alo; i < ahi; i += 1) {
    const next = new Map<number, number>();
    for (let j = blo; j < bhi; j += 1) {
      if (left[i] !== right[j]) {
        continue;
      }
      const run = (lengths.get(j - 1) ?? 0) + 1;
      next.set(j, run);
      if (run > size) {
        startA = i - run + 1;
        startB = j - run + 1;
        size = run;
      }
    }
    lengths.clear();
    for (const [key, value] of next) {
      lengths.set(key, value);
    }
  }
  return { startA, startB, size };
}

function similarity(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }
  const ratio = sequenceRatio(left, right);
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }
  const union = leftTokens.size + rightTokens.size - shared;
  const jaccard = union ? shared / union : 0;
  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];
  const contained = shorter.length >= 3 && longer.includes(shorter) ? 0.85 : 0;
  return Math.max(ratio, jaccard, contained);
}

function bestSimilarity(recallText: string, truth: TruthFact) {
  const candidates = [truth.text, ...(truth.aliases ?? [])];
  const recall = normalise(recallText);
  let best = 0;
  let via: "text" | "alias" = "text";
  candidates.forEach((candidate, index) => {
    const score = similarity(recall, normalise(candidate));
    if (score > best) {
      best = score;
      via = index === 0 ? "text" : "alias";
    }
  });
  return { score: best, via };
}

export function validateFacts(
  doc: { facts?: unknown },
  kind: "truth" | "recall",
) {
  const errors: string[] = [];
  if (!Array.isArray(doc.facts) || doc.facts.length === 0) {
    return ["'facts' must be a non-empty list"];
  }
  const seen = new Set<string>();
  doc.facts.forEach((value, index) => {
    const where = `facts[${index}]`;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${where}: missing fact`);
      return;
    }
    const fact = value as Record<string, unknown>;
    const id = typeof fact.id === "string" ? fact.id : "";
    if (!id || seen.has(id)) {
      errors.push(`${where}: missing or duplicate id`);
    }
    seen.add(id);
    if (!FACT_TYPES.includes(fact.type as FactType)) {
      errors.push(`${where}: bad type ${String(fact.type)}`);
    }
    if (typeof fact.text !== "string" || !fact.text.trim()) {
      errors.push(`${where}: empty text`);
    }
    if (kind === "truth") {
      if (fact.salience !== "core" && fact.salience !== "detail") {
        errors.push(`${where}: bad salience ${String(fact.salience)}`);
      }
      if (fact.aliases !== undefined && !Array.isArray(fact.aliases)) {
        errors.push(`${where}: aliases must be a list`);
      }
    } else if (
      fact.confidence !== undefined &&
      fact.confidence !== "certain" &&
      fact.confidence !== "unsure"
    ) {
      errors.push(`${where}: bad confidence`);
    }
  });
  return errors;
}

function pyRound(value: number, digits: number) {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;
  if (Math.abs(fraction - 0.5) < 1e-8) {
    const even = floor % 2 === 0 ? floor : floor + 1;
    return even / factor;
  }
  return Math.round(scaled) / factor;
}

export function scoreRecall(
  truth: GroundTruth,
  recall: RecallDoc,
  options?: { threshold?: number; crossThreshold?: number; reveal?: boolean },
): RecallScore {
  const threshold = options?.threshold ?? 0.6;
  const crossThreshold = options?.crossThreshold ?? 0.8;
  const pairs: Array<{
    similarity: number;
    same: number;
    recallId: string;
    truthId: string;
    via: "text" | "alias";
  }> = [];
  for (const recalled of recall.facts) {
    for (const fact of truth.facts) {
      const best = bestSimilarity(recalled.text, fact);
      const same = recalled.type === fact.type;
      const needed = same ? threshold : crossThreshold;
      if (best.score >= needed) {
        pairs.push({
          similarity: pyRound(best.score, 6),
          same: same ? 1 : 0,
          recallId: recalled.id,
          truthId: fact.id,
          via: best.via,
        });
      }
    }
  }
  pairs.sort(
    (left, right) =>
      right.similarity - left.similarity ||
      right.same - left.same ||
      left.recallId.localeCompare(right.recallId) ||
      left.truthId.localeCompare(right.truthId),
  );
  const usedRecall = new Set<string>();
  const usedTruth = new Set<string>();
  const matches: ScoreMatch[] = [];
  for (const pair of pairs) {
    if (usedRecall.has(pair.recallId) || usedTruth.has(pair.truthId)) {
      continue;
    }
    usedRecall.add(pair.recallId);
    usedTruth.add(pair.truthId);
    matches.push({
      recall_id: pair.recallId,
      truth_id: pair.truthId,
      similarity: pyRound(pair.similarity, 3),
      via: pair.via,
    });
  }

  const fraction = (items: TruthFact[]) =>
    items.length === 0
      ? null
      : pyRound(
          items.filter((fact) => usedTruth.has(fact.id)).length / items.length,
          3,
        );
  const core = truth.facts.filter((fact) => fact.salience === "core");
  const detail = truth.facts.filter((fact) => fact.salience === "detail");
  const coreRecall = fraction(core);
  const detailRecall = fraction(detail);
  const overallRecall = fraction(truth.facts);
  const intrusionRate = recall.facts.length
    ? pyRound((recall.facts.length - usedRecall.size) / recall.facts.length, 3)
    : 0;
  const unsureRate = recall.facts.length
    ? pyRound(
        recall.facts.filter((fact) => fact.confidence === "unsure").length /
          recall.facts.length,
        3,
      )
    : 0;
  const perType: Partial<Record<FactType, number>> = {};
  for (const type of FACT_TYPES) {
    const items = truth.facts.filter((fact) => fact.type === type);
    const value = fraction(items);
    if (value !== null) {
      perType[type] = value;
    }
  }
  const detailWeight = detailRecall ?? coreRecall ?? 0;
  const composite = pyRound(
    Math.min(
      100,
      Math.max(
        0,
        100 *
          (0.65 * (coreRecall ?? 0) +
            0.25 * detailWeight +
            0.1 * (1 - intrusionRate)),
      ),
    ),
    1,
  );

  return {
    date: truth.date,
    window: truth.window,
    n_truth: truth.facts.length,
    n_core: core.length,
    n_recall: recall.facts.length,
    core_recall: coreRecall,
    detail_recall: detailRecall,
    overall_recall: overallRecall,
    intrusion_rate: intrusionRate,
    unsure_rate: unsureRate,
    per_type_recall: perType,
    composite,
    thresholds: { same_type: threshold, cross_type: crossThreshold },
    matches,
    misses: truth.facts.flatMap((fact) => {
      if (usedTruth.has(fact.id)) {
        return [];
      }
      const miss: ScoreMiss = {
        truth_id: fact.id,
        salience: fact.salience,
        type: fact.type,
      };
      if (options?.reveal) {
        miss.text = fact.text;
      }
      return [miss];
    }),
    intrusions: recall.facts.flatMap((fact) =>
      usedRecall.has(fact.id)
        ? []
        : [{ recall_id: fact.id, type: fact.type, text: fact.text }],
    ),
  };
}
