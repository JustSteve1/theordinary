import type { PreparedConfig } from "@/src/platform/scoring/config";
import type {
  DimensionScore,
  FactMatch,
  ProbeAnswer,
  ScoreMetrics,
  ScoreProbe,
} from "@/src/platform/scoring/types";

export function round1(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function scoreMetrics(input: {
  dimensions: DimensionScore[];
  facts: FactMatch[];
  probes: ScoreProbe[];
  internal: number;
  external: number;
  abstained: number;
  empty: boolean;
  config: PreparedConfig;
}): ScoreMetrics {
  const recognition = recognitionRates(input.probes);
  const accuracy = input.empty ? null : accuracyOf(input.facts, input.probes, input.config);
  const richness = input.empty
    ? null
    : richnessOf(input.dimensions, input.internal, input.external, input.config);
  return {
    accuracy,
    richness,
    recall: input.empty ? null : recallOf(input.facts, input.config),
    core: input.empty ? null : familyMean(input.facts, "core", input.config),
    detail: input.empty ? null : familyMean(input.facts, "detail", input.config),
    intrusion: input.empty ? null : intrusionOf(input.facts, input.probes),
    recognitionHit: recognition.hit,
    recognitionFalseAlarm: recognition.falseAlarm,
    internalDetails: input.internal,
    externalDetails: input.external,
    abstained: input.abstained,
    specificityRatio:
      input.internal + input.external === 0
        ? null
        : input.internal / (input.internal + input.external),
  };
}

function accuracyOf(facts: FactMatch[], probes: ScoreProbe[], config: PreparedConfig) {
  if (config.nullWhenNoFacts && facts.length === 0) {
    return null;
  }
  const recall = recallOf(facts, config);
  if (recall === null) {
    return null;
  }
  const intrusion = intrusionOf(facts, probes);
  return round1(recall * (1 - config.intrusionWeight * intrusion) * 100);
}

function recallOf(facts: FactMatch[], config: PreparedConfig) {
  const core = familyMean(facts, "core", config);
  const detail = familyMean(facts, "detail", config);
  if (core === null && detail === null) {
    return facts.length === 0 ? null : 0;
  }
  if (core === null) {
    return detail;
  }
  if (detail === null) {
    return core;
  }
  return (core + detail) / 2;
}

function familyMean(facts: FactMatch[], family: "core" | "detail", config: PreparedConfig) {
  const rows = facts.filter((fact) => config.kindFamily[fact.kind] === family);
  if (rows.length === 0) {
    return null;
  }
  return rows.reduce((sum, fact) => sum + fact.score, 0) / rows.length;
}

function intrusionOf(facts: FactMatch[], probes: ScoreProbe[]) {
  const trueClaims =
    facts.filter((fact) => fact.score > 0).length +
    probes.filter((probe) => !probe.isLure && probe.answer === "yes").length;
  const falseClaims = probes.filter((probe) => probe.isLure && probe.answer === "yes").length;
  if (trueClaims + falseClaims === 0) {
    return 0;
  }
  return falseClaims / (trueClaims + falseClaims);
}

function recognitionRates(probes: ScoreProbe[]) {
  const answered = (answer: ProbeAnswer | undefined) => answer === "yes" || answer === "no";
  const truths = probes.filter((probe) => !probe.isLure && answered(probe.answer));
  const lures = probes.filter((probe) => probe.isLure && answered(probe.answer));
  return {
    hit: truths.length ? truths.filter((probe) => probe.answer === "yes").length / truths.length : null,
    falseAlarm: lures.length
      ? lures.filter((probe) => probe.answer === "yes").length / lures.length
      : null,
  };
}

function richnessOf(
  dimensions: DimensionScore[],
  internal: number,
  external: number,
  config: PreparedConfig,
) {
  const included = dimensions.filter((dimension) =>
    ["people", "places", "conversations", "decisions"].includes(dimension.id),
  );
  const mean =
    included.reduce((sum, dimension) => sum + dimension.level / 3, 0) / included.length;
  const density = Math.min(1, internal / config.densityTarget);
  const ratio = internal + external === 0 ? 0 : internal / (internal + external);
  return round1(100 * (config.richnessDim * mean + config.richnessDensity * density * ratio));
}
