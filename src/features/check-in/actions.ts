"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

import { loadBee } from "@/src/platform/integrations/bee";
import { assessTalk } from "@/src/platform/recall/answer-key";
import { loadDossier } from "@/src/platform/recall/dossier";
import { beeCoversYesterday, precheck } from "@/src/platform/recall/capture";
import { clearReveal, writeReveal } from "@/src/platform/recall/cookies";
import { copy } from "@/src/platform/recall/copy";
import { yesterdayKey } from "@/src/platform/recall/dates";
import {
  field,
  isRedirectError,
  type FormState,
} from "@/src/platform/recall/form";
import { requireRecall } from "@/src/platform/recall/guard";
import { TALK_MS } from "@/src/platform/recall/probe-timing";
import { defaultRubric, scoreRubric } from "@/src/platform/recall/rubric";
import {
  insertSession,
  insertTalk,
  listSessions,
  loadRubric,
  updateMicStatus,
} from "@/src/platform/recall/store";
import { logSession } from "@/src/platform/recall/log-session";
import { buildSession } from "@/src/platform/recall/trend";
import { mockMissed } from "@/src/features/check-in/script";
import type { TalkPayload } from "@/src/features/hello-world/talk-payload";

export async function finishTalk(
  payload: TalkPayload,
): Promise<{ error?: string; saved?: boolean }> {
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
    const sessions = dossier.sessions;
    const facts = dossier.facts;
    const now = new Date();
    const scored = assessTalk({
      id: randomUUID(),
      now,
      facts,
      narrative,
      answers: [],
      prior: sessions,
      confounders: {
        poorSleep: Boolean(payload.poorSleep),
        unwellOrAlcohol: Boolean(payload.unwell),
      },
    });
    const session = await logSession({ ...scored, prior: sessions });
    const durationMs = Math.max(
      0,
      Math.min(60 * 60 * 1000, Math.round(Number(payload.durationMs) || 0)),
    );
    const stored = await loadRubric(profile.id);
    const spoken = `${narrative} ${turns.map((turn) => turn.answer).join(" ")}`.trim();
    const openerId = probeId(payload.openerId);
    const followUpId = probeId(payload.followUpId);
    await insertSession(profile.id, session, {
      durationMs,
      short: durationMs < TALK_MS,
      openerId,
      followUpId,
      scores: scoreRubric(stored ?? defaultRubric(facts), spoken),
    });
    await insertTalk(profile.id, session.id, narrative, turns);
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

export async function discardReveal(formData: FormData) {
  await clearReveal();
  const to = field(formData, "to") === "dashboard" ? "/app" : "/home";
  redirect(to);
}
