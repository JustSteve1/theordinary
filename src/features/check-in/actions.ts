"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

import { emitNudgeEvent } from "@/src/platform/nudges";
import { loadBee } from "@/src/platform/integrations/bee";
import {
  buildBeeExportPayload,
  pushCheckinToBee,
} from "@/src/platform/integrations/bee-export";
import { loadDossier } from "@/src/platform/recall/dossier";
import { beeCoversYesterday, precheck } from "@/src/platform/recall/capture";
import { clearReveal, writeReveal } from "@/src/platform/recall/cookies";
import { copy } from "@/src/platform/recall/copy";
import { dateKey, yesterdayKey } from "@/src/platform/recall/dates";
import {
  field,
  isRedirectError,
  type FormState,
} from "@/src/platform/recall/form";
import { requireRecall } from "@/src/platform/recall/guard";
import { TALK_MS } from "@/src/platform/recall/probe-timing";
import { defaultRubric } from "@/src/platform/recall/rubric";
import {
  insertSession,
  insertTalk,
  listSessions,
  loadRubric,
  saveSessionMood,
  updateMicStatus,
} from "@/src/platform/recall/store";
import { logSession } from "@/src/platform/recall/log-session";
import { buildSession } from "@/src/platform/recall/trend";
import { mockMissed } from "@/src/features/check-in/script";
import type { FinishResult, TalkPayload } from "@/src/features/hello-world/talk-payload";
import { factsForDay, historyForLures } from "@/src/platform/scoring/bee-facts";
import { loadConfig } from "@/src/platform/scoring/config";
import { insertCheckin, insertScoreRun } from "@/src/platform/scoring/persist";
import { selectProbes } from "@/src/platform/scoring/probes";
import { scoreTalk } from "@/src/platform/scoring/score";
import type { ProbeAnswer, ScoreProbe } from "@/src/platform/scoring/types";
import { scoreV1 } from "@/src/platform/scoring/v1";

export async function finishTalk(payload: TalkPayload): Promise<FinishResult> {
  const profile = await requireRecall({ min: "done", max: "done" });
  if (!profile.consent.healthAcceptedAt) {
    return { error: "Health-data consent is needed before a check-in." };
  }

  const narrative = String(payload.narrative ?? "")
    .trim()
    .slice(0, 8000);
  const turns = (Array.isArray(payload.turns) ? payload.turns : [])
    .slice(0, 6)
    .map((item) => ({
      id: String(item?.id ?? "").slice(0, 80),
      question: String(item?.question ?? "")
        .trim()
        .slice(0, 800),
      answer: String(item?.answer ?? "")
        .trim()
        .slice(0, 2000),
    }))
    .filter((item) => item.id && (item.question || item.answer));
  if (!narrative && turns.every((item) => !item.answer)) {
    return {
      error: "Nothing was captured. Tap the button and talk about your day.",
    };
  }

  try {
    const dossier = await loadDossier(profile.id);
    const now = new Date();
    const targetDate = yesterdayKey(now.getTime());
    const spoken = `${narrative} ${turns.map((turn) => turn.answer).join(" ")}`.trim();
    const beeFacts = factsForDay(dossier.bee, targetDate);
    const stored = await loadRubric(profile.id);
    const rubric = stored ?? defaultRubric(dossier.facts);
    const customItems = rubric.filter((item) => item.id.startsWith("custom-"));
    const priorNonEmpty = dossier.sessions.filter((session) => !session.aborted).length;
    const config = loadConfig();
    const draftId = uuid(payload.draftId) ?? randomUUID();
    const lexical = scoreTalk({
      checkinId: draftId,
      recordedAt: now.toISOString(),
      targetDate,
      talkText: spoken,
      beeFacts,
      customItems,
      priorNonEmpty,
      probes: [],
    });
    const selected = selectProbes({
      facts: beeFacts,
      matches: lexical.facts,
      history: historyForLures(dossier.bee, targetDate),
      targetDate,
      seedText: draftId,
      config,
    });
    const answers = probeAnswers(payload.probeAnswers);
    if (config.probesEnabled && selected.length > 0 && answers.length === 0) {
      return {
        draftId,
        probes: selected.map((probe) => ({ id: probe.id, question: probe.question })),
      };
    }
    const probes: ScoreProbe[] = selected.map((probe) => ({
      ...probe,
      answer: answers.find((answer) => answer.id === probe.id)?.answer ?? "dont_know",
    }));
    const v2 = scoreTalk({
      checkinId: draftId,
      recordedAt: now.toISOString(),
      targetDate,
      talkText: spoken,
      beeFacts,
      customItems,
      priorNonEmpty,
      probes,
    });
    const v1 = scoreV1({
      id: draftId,
      talk: spoken,
      facts: dossier.facts,
      rubric,
      now,
    });
    const prior = dossier.sessions.filter((session) => !session.practice);
    const session = await logSession({
      id: draftId,
      recordedAt: now.toISOString(),
      date: dateKey(now.getTime()),
      window: "day",
      aborted: false,
      composite: v2.metrics.accuracy,
      coreRecall: v2.metrics.core,
      detailRecall: v2.metrics.detail,
      intrusionRate: v2.metrics.intrusion,
      confounders: {
        poorSleep: Boolean(payload.poorSleep),
        unwellOrAlcohol: Boolean(payload.unwell),
      },
      prior,
    });
    session.practice = v2.flags.practice;
    const durationMs = Math.max(
      0,
      Math.min(60 * 60 * 1000, Math.round(Number(payload.durationMs) || 0)),
    );
    await insertSession(profile.id, session, {
      durationMs,
      short: durationMs < TALK_MS,
      openerId: probeId(payload.openerId),
      followUpId: probeId(payload.followUpId),
      scores: [
        ...v2.dimensions.map((dimension) => ({
          id: dimension.id,
          label: dimension.label,
          score: dimension.display,
        })),
        ...v2.custom,
      ],
    });
    await insertTalk(profile.id, session.id, narrative, turns);
    await insertCheckin(profile.id, {
      id: session.id,
      recordedAt: session.recordedAt,
      targetDate,
      talkText: spoken,
      probes,
      beeFacts,
      v1Facts: dossier.facts,
      rubric,
      priorNonEmpty,
    });
    await insertScoreRun({
      checkinId: session.id,
      scorerVersion: v1.scorerVersion,
      configHash: v1.configHash,
      matcherTier: v1.matcherTier,
      payload: v1,
    });
    await insertScoreRun({
      checkinId: session.id,
      scorerVersion: v2.scorerVersion,
      configHash: v2.configHash,
      matcherTier: v2.matcherTier,
      payload: v2,
    });
    await emitNudgeEvent({ type: "checkin_saved", userId: profile.id, eventId: session.id }).catch(
      (error) => console.error("nudge", error instanceof Error ? error.message : error),
    );
    try {
      await pushCheckinToBee(
        profile.id,
        session.id,
        buildBeeExportPayload({
          talkText: spoken,
          recordedAt: session.recordedAt,
          targetDate,
        }),
      );
    } catch {
      // Local save already succeeded. Bee can catch up on a later check-in.
    }
    if (profile.settings.micStatus !== "granted") {
      await updateMicStatus(profile.id, "granted");
    }
    return { saved: true };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: "Something went wrong on our side. Nothing was saved." };
  }
}

export async function completeCheckin(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const poorSleep = formData.get("poor_sleep") === "on";
  const unwell = formData.get("unwell") === "on";
  const profile = await requireRecall({ min: "done", max: "done" });
  if (!profile.consent.healthAcceptedAt) {
    redirect("/welcome/privacy");
  }

  try {
    const [sessions, bee] = await Promise.all([
      listSessions(profile.id),
      loadBee(profile.id),
    ]);
    const check = precheck({
      beeEnabled: profile.settings.beeEnabled,
      beeOk: bee.status === "ok",
      beeHadYesterday: beeCoversYesterday(bee),
      dayCapture: profile.settings.dayCapture,
    });
    if (!check.eligible) {
      return { error: copy.notEnough };
    }

    const scored = buildSession({
      id: randomUUID(),
      now: new Date(),
      date: yesterdayKey(),
      poorSleep,
      unwell,
      prior: sessions,
    });
    const session = await logSession({ ...scored, prior: sessions });
    await insertSession(profile.id, session);
    await writeReveal(mockMissed);
    redirect(`/checkin/done?session=${session.id}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: "Something went wrong on our side. Nothing was saved." };
  }
}

function probeId(value: unknown) {
  const id = String(value ?? "");
  return /^[A-Za-z0-9-]{1,32}$/.test(id) ? id : null;
}

function uuid(value: unknown) {
  const id = String(value ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function probeAnswers(value: TalkPayload["probeAnswers"]) {
  if (!Array.isArray(value)) {
    return [];
  }
  const allowed = new Set<ProbeAnswer>(["yes", "no", "dont_know"]);
  return value
    .slice(0, 6)
    .map((item) => ({
      id: String(item?.id ?? "").slice(0, 80),
      answer: allowed.has(item?.answer) ? item.answer : "dont_know",
    }))
    .filter((item) => item.id);
}

export async function saveMood(formData: FormData) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const sessionId = uuid(field(formData, "session"));
  const mood = Number(field(formData, "mood"));
  if (sessionId) {
    await saveSessionMood(profile.id, sessionId, mood);
    redirect(`/checkin/done?session=${sessionId}`);
  }
  redirect("/home");
}

export async function discardReveal(formData: FormData) {
  await clearReveal();
  const to = field(formData, "to") === "dashboard" ? "/app" : "/home";
  redirect(to);
}
