import type { BeeSnapshot } from "@/src/platform/integrations/bee";
import { dateKey, yesterdayKey } from "@/src/platform/recall/dates";
import type { Precheck, RecallProfile } from "@/src/platform/recall/types";

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

export function dayCaptureLive(profile: RecallProfile, now = Date.now()) {
  if (!profile.settings.dayCapture) {
    return false;
  }
  if (!profile.settings.pausedUntil) {
    return true;
  }
  return new Date(profile.settings.pausedUntil).getTime() <= now;
}
