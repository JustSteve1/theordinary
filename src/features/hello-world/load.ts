import { latestBeeDay } from "@/src/platform/recall/answer-key";
import { beeCoversYesterday, precheck } from "@/src/platform/recall/capture";
import { dateKey, formatDay } from "@/src/platform/recall/dates";
import { loadDossier } from "@/src/platform/recall/dossier";
import { selectScript } from "@/src/platform/recall/probe-bank";
import type { TalkScript } from "@/src/platform/recall/probe-timing";
import { listSessionNotes } from "@/src/platform/recall/store";
import { homeState } from "@/src/features/hello-world/state";
import type { HomeStateId, RecallProfile } from "@/src/platform/recall/types";

export async function loadHomeContext(profile: RecallProfile): Promise<{
  state: HomeStateId;
  quietBee: boolean;
  beeDay: string | null;
  neededToday: boolean;
  lastShort: boolean;
  script: TalkScript;
}> {
  const dossier = await loadDossier(profile.id);
  const { bee, sessions } = dossier;
  const notes = await listSessionNotes(profile.id);
  const completed = notes.filter((note) => !note.aborted);
  const today = dateKey(Date.now());
  const check = precheck({
    beeEnabled: profile.settings.beeEnabled,
    beeOk: bee.status === "ok",
    beeHadYesterday: beeCoversYesterday(bee),
    dayCapture: profile.settings.dayCapture,
  });
  const priorCompleted = sessions.filter((session) => !session.aborted).length;
  return {
    state: homeState({ profile, check }),
    quietBee: check.reason === "quiet",
    beeDay: (() => {
      const latest = latestBeeDay(bee);
      return latest ? formatDay(latest.day) : null;
    })(),
    neededToday: !completed.some(
      (note) => dateKey(new Date(note.recordedAt).getTime()) === today,
    ),
    lastShort: Boolean(completed.at(-1)?.short),
    script: selectScript(priorCompleted),
  };
}
