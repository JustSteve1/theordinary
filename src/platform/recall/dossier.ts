import { loadBee, type BeeSnapshot } from "@/src/platform/integrations/bee";
import {
  loadWhoop,
  type WhoopSnapshot,
} from "@/src/platform/integrations/whoop";
import {
  buildAnswerKey,
  type AnswerFact,
} from "@/src/platform/recall/answer-key";
import {
  listSessions,
  listTalks,
  type StoredTalk,
} from "@/src/platform/recall/store";
import type { SessionRecord } from "@/src/platform/recall/types";

/** What Hello World scores. Chat reads swappable sources instead of this. */
export type MemberDossier = {
  bee: BeeSnapshot;
  whoop: WhoopSnapshot;
  sessions: SessionRecord[];
  talks: StoredTalk[];
  facts: AnswerFact[];
};

export async function loadDossier(userId: string): Promise<MemberDossier> {
  const [bee, whoop, sessions, talks] = await Promise.all([
    loadBee(userId),
    loadWhoop(userId),
    listSessions(userId),
    listTalks(userId),
  ]);
  const facts = buildAnswerKey({
    bee,
    narratives: talks.map((talk) => ({
      id: talk.id,
      narrative: talk.narrative,
    })),
  });
  return { bee, whoop, sessions, talks, facts };
}
