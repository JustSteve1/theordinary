import {
  clientProbes,
  latestBeeDay,
  type ClientProbe,
} from "@/src/platform/recall/answer-key";
import { beeCoversYesterday, precheck } from "@/src/platform/recall/capture";
import { dateKey, formatDay } from "@/src/platform/recall/dates";
import { loadDossier } from "@/src/platform/recall/dossier";
import { homeState } from "@/src/features/hello-world/state";
import type { HomeStateId, RecallProfile } from "@/src/platform/recall/types";

export async function loadHomeContext(profile: RecallProfile): Promise<{
  state: HomeStateId;
  quietBee: boolean;
  probes: ClientProbe[];
  beeDay: string | null;
}> {
  const dossier = await loadDossier(profile.id);
  const { bee, sessions, facts } = dossier;
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
    probes: clientProbes(facts),
    beeDay: (() => {
      const latest = latestBeeDay(bee);
      return latest ? formatDay(latest.day) : null;
    })(),
  };
}
