import { scoreTalk } from "@/src/platform/scoring/score";
import type { ScoreInput, ScoreResult } from "@/src/platform/scoring/types";
import { scoreV1, type V1Result } from "@/src/platform/scoring/v1";
import type { AnswerFact } from "@/src/platform/recall/answer-key";
import type { RubricItem } from "@/src/platform/recall/rubric";

export type FrozenCheckin = {
  id: string;
  recordedAt: string;
  targetDate: string | null;
  talkText: string;
  beeFacts: ScoreInput["beeFacts"];
  probes: ScoreInput["probes"];
  customItems: ScoreInput["customItems"];
  priorNonEmpty: number;
  v1Facts: AnswerFact[];
  v1Rubric: RubricItem[];
};

export function rescore(checkin: FrozenCheckin, version: "1.0.0" | "2.0.0"): V1Result | ScoreResult {
  if (version === "1.0.0") {
    return scoreV1({
      id: checkin.id,
      talk: checkin.talkText,
      facts: checkin.v1Facts,
      rubric: checkin.v1Rubric,
      now: new Date(checkin.recordedAt),
    });
  }
  return scoreTalk({
    checkinId: checkin.id,
    recordedAt: checkin.recordedAt,
    targetDate: checkin.targetDate,
    talkText: checkin.talkText,
    beeFacts: checkin.beeFacts,
    probes: checkin.probes,
    customItems: checkin.customItems,
    priorNonEmpty: checkin.priorNonEmpty,
  });
}
