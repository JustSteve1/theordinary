"use server";

import { redirect } from "next/navigation";

import { loadBee } from "@/src/platform/integrations/bee";
import {
  field,
  isMicStatus,
  isRedirectError,
  message,
  type FormState,
} from "@/src/platform/recall/form";
import { requireRecall } from "@/src/platform/recall/guard";
import { issueRecallSession } from "@/src/platform/recall/session";
import {
  saveBeeChoice,
  saveHealthConsent,
  saveMicStep,
  saveReminder,
  setStep,
  updateDayCapture,
} from "@/src/platform/recall/store";

export async function acceptHealth(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  if (formData.get("health") !== "on") {
    return { error: "Tick the box to continue." };
  }
  const profile = await requireRecall({ min: "privacy", max: "done" });
  try {
    const step = await saveHealthConsent(
      profile.id,
      Boolean(profile.onboardedAt),
    );
    profile.step = step;
    profile.consent.healthAcceptedAt = new Date().toISOString();
    const sessionError = await issueRecallSession(profile);
    if (sessionError) {
      return { error: sessionError };
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: message(error) };
  }
  redirect(profile.onboardedAt ? "/home" : "/welcome/microphone");
}

export async function saveMicrophone(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireRecall({ min: "microphone", max: "bee" });
  const mic = field(formData, "mic_status");
  if (!isMicStatus(mic) || mic === "unknown") {
    return { error: "Allow the microphone, or skip for now." };
  }
  try {
    await saveMicStep(profile.id, {
      micStatus: mic,
      dayCapture: formData.get("day_capture") === "on",
    });
    profile.step = "bee";
    const sessionError = await issueRecallSession(profile);
    if (sessionError) {
      return { error: sessionError };
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: message(error) };
  }
  redirect("/welcome/bee");
}

export async function connectBee(): Promise<FormState> {
  const profile = await requireRecall({ min: "bee", max: "done" });
  const alreadyDone = profile.step === "done";
  const bee = await loadBee(profile.id);
  if (bee.status !== "ok") {
    return {
      error: "Bee is quiet on this server. Try again when Bee is running.",
    };
  }
  try {
    await saveBeeChoice(profile.id, true);
    if (profile.step !== "done") {
      await setStep(profile.id, "done");
      profile.step = "done";
    }
    const sessionError = await issueRecallSession(profile);
    if (sessionError) {
      return { error: sessionError };
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: message(error) };
  }
  redirect(alreadyDone ? "/app" : "/home");
}

export async function finishBee(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireRecall({ min: "bee", max: "bee" });
  const enableCapture = formData.get("day_capture") === "on";
  try {
    if (enableCapture) {
      await updateDayCapture(profile.id, true);
    }
    await setStep(profile.id, "done");
    profile.step = "done";
    const sessionError = await issueRecallSession(profile);
    if (sessionError) {
      return { error: sessionError };
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: message(error) };
  }
  redirect("/home");
}

export async function saveReminderAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireRecall({ min: "done", max: "done" });
  const time = field(formData, "time");
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { error: "Choose a time." };
  }
  const channel =
    field(formData, "channel") === "notification" ? "notification" : "email";
  try {
    await saveReminder(profile.id, { time, enabled: true, channel });
  } catch (error) {
    return { error: message(error) };
  }
  redirect("/home");
}
