import type { PreparedConfig } from "@/src/platform/scoring/config";
import type { FactMatch } from "@/src/platform/scoring/types";

export type JudgeResult = {
  score: 0 | 0.5 | 1;
  confidence: number;
  evidence: string;
};

export type FactJudge = (input: {
  factText: string;
  clauseText: string;
  promptVersion: string;
}) => Promise<JudgeResult> | JudgeResult;

/**
 * Semantic tier. Off unless the config flag is on and a judge is injected.
 * Evidence that is not a substring of the clause is discarded.
 */
export async function applySemantic(input: {
  matches: FactMatch[];
  clauses: { id: string; text: string; status: string }[];
  facts: { factId: string; text: string }[];
  config: PreparedConfig;
  judge?: FactJudge;
  enabled?: boolean;
}): Promise<{ matches: FactMatch[]; tier: "lexical" | "semantic" }> {
  if (!input.enabled || !input.config.semanticEnabled || !input.judge) {
    return { matches: input.matches, tier: "lexical" };
  }
  const next: FactMatch[] = [];
  for (const match of input.matches) {
    const fact = input.facts.find((item) => item.factId === match.factId);
    if (!fact) {
      next.push(match);
      continue;
    }
    let best = match;
    for (const clause of input.clauses) {
      if (clause.status !== "internal") {
        continue;
      }
      const judged = await input.judge({
        factText: fact.text,
        clauseText: clause.text,
        promptVersion: input.config.semanticPrompt,
      });
      if (input.config.requireEvidence && !clause.text.includes(judged.evidence)) {
        continue;
      }
      if (judged.confidence < 0.5 || judged.score === 0) {
        continue;
      }
      if (judged.score > best.score) {
        best = {
          ...match,
          score: judged.score,
          status: judged.score === 1 ? "MATCH" : "PARTIAL",
          clauseId: clause.id,
          evidence: judged.evidence,
          reason: "Matched by the semantic check against this clause",
        };
      }
    }
    next.push(best);
  }
  return { matches: next, tier: "semantic" };
}
