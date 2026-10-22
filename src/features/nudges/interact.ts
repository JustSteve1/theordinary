import type { NudgeAction } from "@/src/platform/nudges";

export function nudgeAction(value: unknown): Exclude<NudgeAction, "shown"> | null {
  if (value === "thanks" || value === "helpful" || value === "not_for_me") {
    return value;
  }
  return null;
}

export function helpfulFor(action: Exclude<NudgeAction, "shown">) {
  if (action === "helpful") {
    return true;
  }
  if (action === "not_for_me") {
    return false;
  }
  return null;
}
