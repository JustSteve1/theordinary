import type { BeeSnapshot } from "@/lib/integrations/bee/client";
import { dateKey, sameLondonDay, yesterdayKey } from "@/lib/recall/dates";
import type { HomeStateId, Precheck, RecallProfile } from "@/lib/recall/types";

export function beeCoversYesterday(bee: BeeSnapshot, now = Date.now()) {
  const yesterday = yesterdayKey(now);
  return (
    bee.conversations.some((item) => dateKey(item.startMs) === yesterday) ||
    bee.dailies.some((item) => dateKey(item.atMs) === yesterday)
  );
}

export function precheck(input: {
  beeEnabled: boolean;
  beeOk: boolean;
  beeHadYesterday: boolean;
  dayCapture: boolean;
}): Precheck {
  if (input.dayCapture) {
    return { eligible: true, reason: "ok", source: "day_capture" };
  }
  if (!input.beeEnabled) {
    return { eligible: false, reason: "none", source: "none" };
  }
  if (!input.beeOk) {
    return { eligible: false, reason: "quiet", source: "bee" };
  }
  if (!input.beeHadYesterday) {
    return { eligible: false, reason: "not_enough", source: "bee" };
  }
  return { eligible: true, reason: "ok", source: "bee" };
}

export function homeState(input: {
  profile: RecallProfile;
  checkedInToday: boolean;
  sessionCount: number;
  check: Precheck;
  now?: number;
}): HomeStateId {
  const now = input.now ?? Date.now();
  if (!input.profile.consent.healthAcceptedAt) {
    return "needs_consent";
  }

  const justOnboarded =
    input.sessionCount === 0 &&
    sameLondonDay(input.profile.onboardedAt, now);

  if (justOnboarded) {
    return "day1";
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

export function dayCaptureLive(profile: RecallProfile, now = Date.now()) {
  if (!profile.settings.dayCapture) {
    return false;
  }
  if (!profile.settings.pausedUntil) {
    return true;
  }
  return new Date(profile.settings.pausedUntil).getTime() <= now;
}
