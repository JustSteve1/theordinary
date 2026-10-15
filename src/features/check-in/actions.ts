"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

import { loadBee } from "@/src/platform/integrations/bee";
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
import { insertSession, listSessions } from "@/src/platform/recall/store";
import { buildSession } from "@/src/platform/recall/trend";
import { mockMissed } from "@/src/features/check-in/script";

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
      loadBee(),
    ]);
    const today = dateKey(Date.now());
    if (
      sessions.some(
        (session) =>
          !session.aborted && dateKey(new Date(session.recordedAt).getTime()) === today,
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

    const session = buildSession({
      id: randomUUID(),
      now: new Date(),
      date: yesterdayKey(),
      poorSleep,
      unwell,
      prior: sessions,
    });
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
  const to = field(formData, "to") === "dashboard" ? "/dashboard" : "/home";
  redirect(to);
}
