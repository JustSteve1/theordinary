import { createHash } from "crypto";

import { assessTalk, type AnswerFact } from "@/src/platform/recall/answer-key";
import { defaultRubric, scoreRubric, type RubricItem } from "@/src/platform/recall/rubric";

export const V1_VERSION = "1.0.0";

/** Frozen identity of today's matcher: first 8 keywords, minimum length 4, no stemming. */
export const V1_CONFIG_HASH = createHash("sha256")
  .update("scorer:v1.0.0:keywords-min4-cap8-no-stem")
  .digest("hex");

export type V1Result = {
  scorerVersion: typeof V1_VERSION;
  configHash: string;
  matcherTier: "lexical";
  metrics: {
    composite: number | null;
    core: number | null;
    detail: number | null;
    intrusion: number | null;
  };
  items: { id: string; label: string; score: number }[];
};

export function scoreV1(input: {
  id?: string;
  talk: string;
  facts: AnswerFact[];
  rubric?: RubricItem[];
  now?: Date;
}): V1Result {
  const now = input.now ?? new Date("2026-01-01T00:00:00.000Z");
  const assessed = assessTalk({
    id: input.id ?? "00000000-0000-4000-8000-000000000001",
    now,
    facts: input.facts,
    narrative: input.talk,
    answers: [],
    prior: [],
  });
  const items = scoreRubric(input.rubric ?? defaultRubric(input.facts), input.talk);
  return {
    scorerVersion: V1_VERSION,
    configHash: V1_CONFIG_HASH,
    matcherTier: "lexical",
    metrics: {
      composite: assessed.composite,
      core: assessed.coreRecall,
      detail: assessed.detailRecall,
      intrusion: assessed.intrusionRate,
    },
    items,
  };
}
