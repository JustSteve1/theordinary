import {
  resultFromScore,
  type Confounders,
  type PriorSession,
  type Trend,
} from "./baseline";
import {
  ABORT_PROMPT,
  CONFOUNDER_PROMPT,
  CONSENT_PROMPT,
  DECLINED_PROMPT,
  INELIGIBLE_PROMPT,
  WAITING_PROMPT,
  feedbackPrompt,
  recallPrompt,
} from "./prompts";
import {
  scoreRecall,
  type GroundTruth,
  type RecallDoc,
  type RecallScore,
} from "./score";
import type { WindowName } from "./window";

export const OPEN_PHASES = [
  "consent",
  "confounders",
  "awaiting_capture",
  "recall",
  "followup_1",
  "followup_2",
  "feedback",
] as const;

export type Phase =
  | (typeof OPEN_PHASES)[number]
  | "complete"
  | "declined"
  | "aborted"
  | "ineligible";

export type SkillReply = {
  id: string;
  phase: Phase;
  prompt: string;
  score?: {
    composite: number;
    flag: string;
  };
  reveal?: Array<{ type: string; text: string }>;
};

export function consentReply(id: string, accepted: boolean): SkillReply {
  if (!accepted) {
    return { id, phase: "declined", prompt: DECLINED_PROMPT };
  }
  return { id, phase: "confounders", prompt: CONFOUNDER_PROMPT };
}

export function waitingReply(id: string): SkillReply {
  return { id, phase: "awaiting_capture", prompt: WAITING_PROMPT };
}

export function ineligibleReply(id: string): SkillReply {
  return { id, phase: "ineligible", prompt: INELIGIBLE_PROMPT };
}

export function abortReply(id: string): SkillReply {
  return { id, phase: "aborted", prompt: ABORT_PROMPT };
}

export function recallStep(phase: Phase) {
  if (phase === "recall") {
    return "open" as const;
  }
  if (phase === "followup_1" || phase === "followup_2") {
    return phase;
  }
  return null;
}

export function advanceRecall(phase: Phase) {
  if (phase === "recall") {
    return "followup_1" as const;
  }
  if (phase === "followup_1") {
    return "followup_2" as const;
  }
  return null;
}

export function finishRecall(input: {
  id: string;
  window: WindowName;
  groundTruth: GroundTruth;
  recall: RecallDoc;
  prior: PriorSession[];
  confounders: Confounders;
}) {
  const score = scoreRecall(input.groundTruth, input.recall);
  const result = resultFromScore(score, input.prior, input.confounders);
  const reveal = score.misses.flatMap((miss) => {
    if (miss.salience !== "core") {
      return [];
    }
    const fact = input.groundTruth.facts.find(
      (item) => item.id === miss.truth_id,
    );
    return fact ? [{ type: fact.type, text: fact.text }] : [];
  });
  return {
    score,
    result,
    reveal,
    reply: feedbackReply(
      input.id,
      input.window,
      score,
      result.trend,
      input.confounders,
    ),
  };
}

export function feedbackReply(
  id: string,
  window: WindowName,
  score: RecallScore,
  trend: Trend,
  confounders: Confounders,
  phase: "feedback" | "complete" = "feedback",
): SkillReply {
  return {
    id,
    phase,
    prompt: feedbackPrompt({
      window,
      score,
      trend,
      poorSleep: Boolean(confounders.poor_sleep),
      unwellOrAlcohol: Boolean(confounders.unwell_or_alcohol),
      offer: phase === "feedback",
    }),
    score: { composite: score.composite, flag: trend.flag },
  };
}

export function startReply(id: string): SkillReply {
  return { id, phase: "consent", prompt: CONSENT_PROMPT };
}

export function phasePrompt(input: {
  id: string;
  phase: Phase;
  window: WindowName | null;
  score: RecallScore | null;
  trend: Trend | null;
  confounders: Confounders | null;
}): SkillReply {
  if (input.phase === "consent") {
    return startReply(input.id);
  }
  if (input.phase === "confounders") {
    return { id: input.id, phase: input.phase, prompt: CONFOUNDER_PROMPT };
  }
  if (input.phase === "awaiting_capture") {
    return waitingReply(input.id);
  }
  if (input.phase === "declined") {
    return { id: input.id, phase: input.phase, prompt: DECLINED_PROMPT };
  }
  if (input.phase === "aborted") {
    return abortReply(input.id);
  }
  if (input.phase === "ineligible") {
    return ineligibleReply(input.id);
  }
  const step = recallStep(input.phase);
  if (step && input.window) {
    return {
      id: input.id,
      phase: input.phase,
      prompt: recallPrompt(input.window, step),
    };
  }
  if (
    (input.phase === "feedback" || input.phase === "complete") &&
    input.window &&
    input.score &&
    input.trend
  ) {
    return feedbackReply(
      input.id,
      input.window,
      input.score,
      input.trend,
      input.confounders ?? {},
      input.phase,
    );
  }
  return { id: input.id, phase: input.phase, prompt: "" };
}
