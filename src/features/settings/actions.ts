"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  field,
  isMicStatus,
  message,
  type FormState,
} from "@/src/platform/recall/form";
import { requireRecall } from "@/src/platform/recall/guard";
import { clearRecallSession, issueRecallSession } from "@/src/platform/recall/session";
import {
  deleteAccount,
  deleteSessions,
  findAuthByEmail,
  passwordMatches,
  pauseDayCapture,
  saveBeeChoice,
  saveReminder,
  setPassword,
  updateDayCapture,
  updateMicStatus,
  withdrawHealthConsent,
} from "@/src/platform/recall/store";

export async function updateMic(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireRecall({ min: "done", max: "done" });
  const mic = field(formData, "mic_status");
  if (!isMicStatus(mic) || mic === "unknown") {
    return { error: "Allow the microphone, or skip for now." };
  }
  try {
    await updateMicStatus(profile.id, mic);
  } catch (error) {
    return { error: message(error) };
  }
  redirect("/settings");
}

export async function setReminderEnabled(formData: FormData) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const enabled = formData.get("enabled") === "on";
  await saveReminder(profile.id, {
    time: profile.settings.reminderTime,
    enabled,
    channel: profile.settings.reminderChannel,
  });
  redirect("/settings");
}

export async function pauseCapture() {
  const profile = await requireRecall({ min: "privacy", max: "done" });
  await pauseDayCapture(profile.id, new Date(Date.now() + 60 * 60 * 1000));
  revalidatePath("/", "layout");
}

export async function turnOffCapture() {
  const profile = await requireRecall({ min: "privacy", max: "done" });
  await updateDayCapture(profile.id, false);
  revalidatePath("/", "layout");
}

export async function setDayCapture(formData: FormData) {
  const profile = await requireRecall({ min: "done", max: "done" });
  await updateDayCapture(profile.id, formData.get("day_capture") === "on");
  redirect("/settings");
}

export async function disconnectBee() {
  const profile = await requireRecall({ min: "done", max: "done" });
  await saveBeeChoice(profile.id, false);
  redirect("/settings");
}

export async function withdrawConsent() {
  const profile = await requireRecall({ min: "privacy", max: "done" });
  await withdrawHealthConsent(profile.id);
  profile.step = "privacy";
  profile.consent.healthAcceptedAt = null;
  await issueRecallSession(profile);
  redirect("/welcome/privacy");
}

export async function removeCheckins() {
  const profile = await requireRecall({ min: "done", max: "done" });
  await deleteSessions(profile.id);
  redirect("/settings");
}

export async function removeAccount() {
  const profile = await requireRecall({ min: "privacy", max: "done" });
  await deleteAccount(profile.id);
  await clearRecallSession();
  redirect("/");
}

export async function changePassword(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireRecall({ min: "done", max: "done" });
  const current = field(formData, "current");
  const next = field(formData, "next");
  if (next.length < 8) {
    return { error: "Use at least 8 characters." };
  }
  const row = await findAuthByEmail(profile.email);
  if (!row || !passwordMatches(current, row.password_hash)) {
    return { error: "Email or password is incorrect." };
  }
  try {
    await setPassword(profile.id, next);
  } catch (error) {
    return { error: message(error) };
  }
  redirect("/settings?notice=password");
}
