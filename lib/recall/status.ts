import { loadBee } from "@/lib/integrations/bee/client";
import { dateKey } from "@/lib/recall/dates";
import {
  beeCoversYesterday,
  homeState,
  precheck,
} from "@/lib/recall/home-state";
import { listSessions } from "@/lib/recall/store";
import type { HomeStateId, RecallProfile } from "@/lib/recall/types";

export async function loadHomeContext(profile: RecallProfile): Promise<{
  state: HomeStateId;
  quietBee: boolean;
}> {
  const [sessions, bee] = await Promise.all([
    listSessions(profile.id),
    loadBee(),
  ]);
  const today = dateKey(Date.now());
  const check = precheck({
    beeEnabled: profile.settings.beeEnabled,
    beeOk: bee.status === "ok",
    beeHadYesterday: beeCoversYesterday(bee),
    dayCapture: profile.settings.dayCapture,
  });
  return {
    state: homeState({
      profile,
      checkedInToday: sessions.some(
        (session) =>
          !session.aborted &&
          dateKey(new Date(session.recordedAt).getTime()) === today,
      ),
      sessionCount: sessions.filter((session) => !session.aborted).length,
      check,
    }),
    quietBee: check.reason === "quiet",
  };
}
