"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

import { loadBee } from "@/src/platform/integrations/bee";
import { assessTalk } from "@/src/platform/recall/answer-key";
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
import {
  insertSession,
  insertTalk,
  listSessions,
  updateMicStatus,
} from "@/src/platform/recall/store";
import { logSession } from "@/src/platform/recall/log-session";
import { buildSession } from "@/src/platform/recall/trend";
import { mockMissed } from "@/src/features/check-in/script";

export async function finishTalk(payload: {
  narrative: string;
  answers: { id: string; answer: string }[];
  poorSleep?: boolean;
  unwell?: boolean;
}): Promise<{ error?: string; saved?: boolean }> {
  const profile = await requireRecall({ min: "done", max: "done" });
  if (!profile.consent.healthAcceptedAt) {
    return { error: "Health-data consent is needed before a check-in." };
  }

  const narrative = String(payload.narrative ?? "")
    .trim()
    .slice(0, 8000);
  const answers = (Array.isArray(payload.answers) ? payload.answers : [])
    .slice(0, 6)
    .map((item) => ({
      id: String(item?.id ?? "").slice(0, 80),
      answer: String(item?.answer ?? "")
        .trim()
        .slice(0, 2000),
    }))
    .filter((item) => item.id);
  if (!narrative && answers.every((item) => !item.answer)) {
    return {
      error: "Nothing was captured. Hold the button and talk about your day.",
    };
  }

  try {
    const dossier = await loadDossier(profile.id);
    const sessions = dossier.sessions;
    const facts = dossier.facts;
    const today = dateKey(Date.now());
    if (
      sessions.some(
        (session) =>
          !session.aborted &&
          dateKey(new Date(session.recordedAt).getTime()) === today,
      )
    ) {
      return { error: copy.doneToday };
    }
    const now = new Date();
    const scored = assessTalk({
      id: randomUUID(),
      now,
      facts,
      narrative,
      answers,
      prior: sessions,
      confounders: {
        poorSleep: Boolean(payload.poorSleep),
        unwellOrAlcohol: Boolean(payload.unwell),
      },
    });
    const session = await logSession({ ...scored, prior: sessions });
    await insertSession(profile.id, session);
    await insertTalk(
      profile.id,
      session.id,
      narrative,
      answers.map((item) => ({
        id: item.id,
        question: facts.find((fact) => fact.id === item.id)?.question ?? "",
        answer: item.answer,
      })),
    );
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
    const today = dateKey(Date.now());
    if (
      sessions.some(
        (session) =>
          !session.aborted &&
          dateKey(new Date(session.recordedAt).getTime()) === today,
      )
    ) {
      redirect("/home");
    }
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

export async function discardReveal(formData: FormData) {
  await clearReveal();
  const to = field(formData, "to") === "dashboard" ? "/app" : "/home";
  redirect(to);
}
