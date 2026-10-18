import type { HomeStateId, Precheck, RecallProfile } from "@/src/platform/recall/types";

export function homeState(input: {
  profile: RecallProfile;
  checkedInToday: boolean;
  sessionCount: number;
  check: Precheck;
  now?: number;
}): HomeStateId {
  if (!input.profile.consent.healthAcceptedAt) {
    return "needs_consent";
  }

  const mic = input.profile.settings.micStatus;
  if (mic === "denied" || mic === "missing" || mic === "skipped") {
    return "mic_blocked";
  }

  if (input.check.source === "none") {
    return "no_source";
  }

  if (input.checkedInToday) {
    return "done_today";
  }

  if (!input.check.eligible) {
    return "not_enough_data";
  }

  return "ready";
}
