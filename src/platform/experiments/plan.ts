import type { ExperimentConfig } from "@/src/platform/experiments/config";
import { randomise } from "@/src/platform/experiments/randomise";

export type PlannedDecision = {
  available: boolean;
  reason: string | null;
  arm: string | null;
  probability: number | null;
  randU: number | null;
};

export function planDecision(input: {
  config: ExperimentConfig;
  userId: string;
  decisionDate: string;
  whoopRecent: boolean;
  salt?: string;
}): PlannedDecision {
  if (input.config.availability.skip_dates.includes(input.decisionDate)) {
    return { available: false, reason: "skip_date", arm: null, probability: null, randU: null };
  }
  if (input.config.availability.requires_whoop_yesterday && !input.whoopRecent) {
    return {
      available: false,
      reason: "no_whoop_yesterday",
      arm: null,
      probability: null,
      randU: null,
    };
  }
  const draw = randomise({
    experimentId: input.config.id,
    version: input.config.version,
    userId: input.userId,
    decisionDate: input.decisionDate,
    treatmentProbability: input.config.treatment_probability,
    salt: input.salt,
  });
  return {
    available: true,
    reason: null,
    arm: draw.arm,
    probability: draw.probability,
    randU: draw.randU,
  };
}

export function experimentCardText(
  decision: { arm: string; instruction: string | null } | null,
) {
  if (!decision) {
    return null;
  }
  if (decision.arm === "treatment" && decision.instruction && decision.instruction !== "TODO") {
    return decision.instruction;
  }
  return "Nothing extra today, carry on as normal.";
}
