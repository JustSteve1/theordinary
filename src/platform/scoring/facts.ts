import type { PreparedConfig } from "@/src/platform/scoring/config";
import { contentStems, tokenize } from "@/src/platform/scoring/tokens";
import type { BeeFact, FactKind, FactMatch } from "@/src/platform/scoring/types";

export type TaggedClause = {
  id: string;
  text: string;
  status: "internal" | "external" | "abstained";
  contentStems: string[];
  tokens: ReturnType<typeof tokenize>;
};

export function factKey(text: string, config: PreparedConfig) {
  const stems: string[] = [];
  for (const stem of contentStems(tokenize(text, config))) {
    if (!stems.includes(stem)) {
      stems.push(stem);
    }
    if (stems.length >= config.factKeyMax) {
      break;
    }
  }
  return stems;
}

export function resolveKey(fact: BeeFact, config: PreparedConfig) {
  const source = fact.key?.length ? fact.key : factKey(fact.text, config);
  const stems: string[] = [];
  for (const token of source) {
    const stem = config.stem(token.toLowerCase());
    if (stem && !stems.includes(stem)) {
      stems.push(stem);
    }
    if (stems.length >= config.factKeyMax) {
      break;
    }
  }
  return stems;
}

export function matchFacts(
  facts: BeeFact[],
  clauses: TaggedClause[],
  config: PreparedConfig,
): { matches: FactMatch[]; byClause: Map<string, { kind: FactKind; score: number }[]> } {
  const internal = clauses.filter((clause) => clause.status === "internal");
  const byClause = new Map<string, { kind: FactKind; score: number }[]>();
  const matches: FactMatch[] = [];

  for (const fact of facts) {
    const key = resolveKey(fact, config);
    let best: FactMatch = {
      factId: fact.factId,
      kind: fact.kind,
      score: 0,
      status: "NOT_MENTIONED",
      clauseId: null,
      evidence: null,
      reason: "Not mentioned",
    };
    if (key.length === 0) {
      matches.push(best);
      continue;
    }
    const distinctiveKey = key.some((stem) => !config.genericAll.has(stem));
    for (const clause of internal) {
      const stems = new Set(
        clause.tokens.filter((token) => token.content && !token.negated).map((token) => token.stem),
      );
      const overlap = key.filter((stem) => stems.has(stem));
      const distinctive = overlap.filter((stem) => !config.genericAll.has(stem));
      let score = 0;
      let status: FactMatch["status"] = "NOT_MENTIONED";
      let reason = "Not mentioned";
      if (distinctive.length >= config.fullDistinctive || overlap.length >= config.fullAny) {
        score = 1;
        status = "MATCH";
        reason = "A distinctive detail in this clause matches the recorded fact";
      } else if (overlap.length === 1 && !distinctive.length && distinctiveKey) {
        score = config.partialScore;
        status = "PARTIAL";
        reason = "Only a general word matches the recorded fact";
      }
      const list = byClause.get(clause.id) ?? [];
      if (score > 0) {
        list.push({ kind: fact.kind, score });
        byClause.set(clause.id, list);
      }
      if (score > best.score) {
        best = {
          factId: fact.factId,
          kind: fact.kind,
          score,
          status,
          clauseId: clause.id,
          evidence: clause.text,
          reason,
        };
      }
    }
    matches.push(best);
  }
  return { matches, byClause };
}
