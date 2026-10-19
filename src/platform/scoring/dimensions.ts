import type { DimensionConfig, PreparedConfig } from "@/src/platform/scoring/config";
import type { TaggedClause } from "@/src/platform/scoring/facts";
import type { CustomItem, DimensionScore, FactKind } from "@/src/platform/scoring/types";

export function scoreDimensions(
  clauses: TaggedClause[],
  byClause: Map<string, { kind: FactKind; score: number }[]>,
  config: PreparedConfig,
): DimensionScore[] {
  return config.dimensions.map((dimension) => {
    let best: DimensionScore = {
      id: dimension.id,
      label: dimension.label,
      level: 0,
      display: 0,
      evidence: null,
      reason: "Not mentioned",
    };
    for (const clause of clauses) {
      if (clause.status !== "internal") {
        continue;
      }
      const base = baseLevel(dimension, clause, config);
      if (base === 0) {
        continue;
      }
      const hits = byClause.get(clause.id) ?? [];
      const verified = hits.some(
        (hit) => dimension.verify.has(hit.kind) && hit.score >= config.partialScore,
      );
      const level = Math.min(3, base + (verified ? 1 : 0));
      if (level > best.level) {
        best = {
          id: dimension.id,
          label: dimension.label,
          level,
          display: displayScore(level),
          evidence: clause.text,
          reason: reasonFor(base, verified),
        };
      }
    }
    return best;
  });
}

export function scoreCustom(items: CustomItem[], clauses: TaggedClause[], config: PreparedConfig) {
  const internal = clauses
    .filter((clause) => clause.status === "internal")
    .map((clause) => new Set(clause.contentStems));
  return items.map((item) => {
    const stems = item.terms
      .map((term) => config.stem(term.toLowerCase()))
      .filter((stem) => stem.length >= 3);
    const hit = stems.some((stem) => internal.some((clause) => clause.has(stem)));
    return { id: item.id, label: item.label, score: hit ? 100 : 0 };
  });
}

function baseLevel(dimension: DimensionConfig, clause: TaggedClause, config: PreparedConfig) {
  const tokens = clause.tokens.filter((token) => !token.negated);
  const content = tokens.filter((token) => token.content);
  const trigger = content.some((token) => dimension.generic.has(token.stem));
  if (dimension.id === "people") {
    if (
      content.some((token) => token.entity === "person") ||
      possessive(tokens, dimension.possessives, dimension.relationNouns, config)
    ) {
      return 2;
    }
  }
  if (dimension.id === "places") {
    if (
      content.some((token) => token.entity === "place" || token.entity === "organization") ||
      possessive(tokens, dimension.possessives, dimension.placeNouns, config)
    ) {
      return 2;
    }
  }
  if (dimension.id === "conversations" && trigger && otherContent(content, config) >= dimension.minTopic) {
    return 2;
  }
  if (dimension.id === "decisions" && trigger && otherContent(content, config) >= dimension.minObject) {
    return 2;
  }
  return trigger ? 1 : 0;
}

function possessive(
  tokens: TaggedClause["tokens"],
  possessives: Set<string>,
  nouns: Set<string>,
  config: PreparedConfig,
) {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];
    if (!current || !next) {
      continue;
    }
    if (possessives.has(current.lower) && nouns.has(config.stem(next.lower))) {
      return true;
    }
  }
  return false;
}

function otherContent(tokens: TaggedClause["tokens"], config: PreparedConfig) {
  return tokens.filter((token) => token.content && !config.genericAll.has(token.stem)).length;
}

function displayScore(level: number) {
  return Math.round((level / 3) * 100);
}

function reasonFor(base: number, verified: boolean) {
  if (base >= 2 && verified) {
    return "Specific, and it matches a recorded fact";
  }
  if (base >= 2) {
    return "Specific";
  }
  if (verified) {
    return "A general mention that matches a recorded fact";
  }
  return "A general mention";
}
