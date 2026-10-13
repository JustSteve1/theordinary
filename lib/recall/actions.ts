"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth/actions";
import { hashPassword } from "@/lib/auth/password";
import { StoreError } from "@/lib/db";
import { loadBee } from "@/lib/integrations/bee/client";
import {
  clearAttempts,
  clearDraft,
  clearPending,
  clearReveal,
  readAttempts,
  readDraft,
  readPending,
  writeAttempts,
  writeDraft,
  writePending,
  writeReveal,
} from "@/lib/recall/cookies";
import { copy } from "@/lib/recall/copy";
import { dateKey, yesterdayKey } from "@/lib/recall/dates";
import { recallDefaults } from "@/lib/recall/defaults";
import { requireRecall } from "@/lib/recall/guard";
import { beeCoversYesterday, precheck } from "@/lib/recall/home-state";
import { pathForStep } from "@/lib/recall/paths";
import { mockMissed } from "@/lib/recall/script";
import { clearRecallSession, issueRecallSession } from "@/lib/recall/session";
import {
  changePendingEmail,
  clearFailedLogins,
  consumeEmailToken,
  createPendingMember,
  deleteAccount,
  deleteSessions,
  findAuthByEmail,
  getRecallProfile,
  insertSession,
  issueEmailToken,
  listSessions,
  lockActive,
  passwordMatches,
  pauseDayCapture,
  recordFailedLogin,
  saveBeeChoice,
  saveHealthConsent,
  saveMicStep,
  updateMicStatus,
  saveReminder,
  sendVerificationEmail,
  setPassword,
  setStep,
  updateDayCapture,
  withdrawHealthConsent,
} from "@/lib/recall/store";
import type { MicStatus } from "@/lib/recall/types";
import { buildSession } from "@/lib/recall/trend";

export type FormState = {
  error?: string;
  termsError?: string;
  privacyError?: string;
  code?: "unverified";
  retryIn?: number;
};

const unreachable =
  "We couldn't reach the server. Nothing was saved. Try again.";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function message(error: unknown) {
  if (error instanceof StoreError) {
    return error.message;
  }
  console.error(error);
  return unreachable;
}

function appOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function saveSignupDraft(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");

  if (name.length < 1 || name.length > 80) {
    return { error: "Enter your first name." };
  }
  if (!validEmail(email)) {
    return { error: "Enter a valid email." };
  }
  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }

  const saved = await writeDraft({
    name,
    email,
    passwordHash: hashPassword(password),
  });
  if (!saved) {
    return {
      error: "Add SESSION_SECRET to the server environment before signing in.",
    };
  }
  redirect("/signup/terms");
}

export async function acceptTerms(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const draft = await readDraft();
  if (!draft) {
    redirect("/signup");
  }

  const terms = formData.get("agree_terms") === "on";
  const privacy = formData.get("agree_privacy") === "on";
  if (!terms || !privacy) {
    return {
      termsError: terms ? undefined : "Tick this box to continue.",
      privacyError: privacy ? undefined : "Tick this box to continue.",
    };
  }

  try {
    const user = await createPendingMember({
      name: draft.name,
      email: draft.email,
      passwordHash: draft.passwordHash,
    });
    const issued = await issueEmailToken(user.id, user.email, "verify");
    if (issued.token) {
      await sendVerificationEmail(
        user.email,
        `${appOrigin()}/verify?token=${issued.token}`,
      );
    }
    await clearDraft();
    const pending = await writePending(user.id);
    if (!pending) {
      return {
        error:
          "Add SESSION_SECRET to the server environment before signing in.",
      };
    }
  } catch (error) {
    return { error: message(error) };
  }

  redirect("/signup/verify");
}

export async function resendVerification(): Promise<FormState> {
  const pending = await readPending();
  if (!pending) {
    return { error: "Start from the sign-up page to get a new link." };
  }
  const profile = await getRecallProfile(pending.userId);
  if (!profile) {
    return { error: "Start from the sign-up page to get a new link." };
  }
  if (profile.emailVerifiedAt) {
    redirect(pathForStep(profile.step));
  }

  try {
    const issued = await issueEmailToken(profile.id, profile.email, "verify");
    if (!issued.token) {
      return { retryIn: issued.retryIn };
    }
    await sendVerificationEmail(
      profile.email,
      `${appOrigin()}/verify?token=${issued.token}`,
    );
    return { retryIn: recallDefaults.resendCooldownSeconds };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function changeSignupEmail(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const pending = await readPending();
  if (!pending) {
    return { error: "Start from the sign-up page to change the email." };
  }
  const email = field(formData, "email").toLowerCase();
  if (!validEmail(email)) {
    return { error: "Enter a valid email." };
  }

  try {
    const next = await changePendingEmail(pending.userId, email);
    const issued = await issueEmailToken(pending.userId, next, "verify");
    if (issued.token) {
      await sendVerificationEmail(next, `${appOrigin()}/verify?token=${issued.token}`);
    }
    return issued.token
      ? { retryIn: recallDefaults.resendCooldownSeconds }
      : { retryIn: issued.retryIn };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function logIn(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const attempts = await readAttempts();
  if (attempts >= recallDefaults.loginAttemptLimit) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }
  if (!validEmail(email) || password.length === 0) {
    await writeAttempts(attempts + 1);
    return { error: "Email or password is incorrect." };
  }

  try {
    const row = await findAuthByEmail(email);
    if (row && lockActive(row)) {
      return { error: "Too many attempts. Try again in a few minutes." };
    }
    if (!row || !passwordMatches(password, row.password_hash)) {
      await writeAttempts(attempts + 1);
      if (row) {
        await recordFailedLogin(row.id);
      }
      return { error: "Email or password is incorrect." };
    }
    if (!row.email_verified_at) {
      await writePending(row.id);
      return {
        code: "unverified",
        error: "This email isn't verified yet. We can send a new link.",
      };
    }

    await clearFailedLogins(row.id);
    await clearAttempts();
    const profile = await getRecallProfile(row.id);
    if (!profile) {
      return { error: unreachable };
    }
    const sessionError = await issueRecallSession(profile);
    if (sessionError) {
      return { error: sessionError };
    }
    redirect(pathForStep(profile.step));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: message(error) };
  }
}

export async function requestPasswordReset(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = field(formData, "email").toLowerCase();
  if (!validEmail(email)) {
    return { error: "Enter a valid email." };
  }

  try {
    const row = await findAuthByEmail(email);
    if (row) {
      const issued = await issueEmailToken(row.id, row.email, "reset");
      if (issued.token) {
        const link = `${appOrigin()}/reset?token=${issued.token}`;
        await sendVerificationEmail(row.email, link);
        if (process.env.NODE_ENV !== "production") {
          redirect(`/login/forgot?sent=1&link=${encodeURIComponent(link)}`);
        }
      }
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: message(error) };
  }

  redirect("/login/forgot?sent=1");
}

export async function resetPassword(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = field(formData, "token");
  const password = field(formData, "password");
  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }

  try {
    const consumed = await consumeEmailToken(token, "reset");
    if (consumed.status !== "ok") {
      return { error: "This link has expired." };
    }
    await setPassword(consumed.userId, password);
    const profile = await getRecallProfile(consumed.userId);
    if (!profile?.emailVerifiedAt) {
      redirect("/login");
    }
    const sessionError = await issueRecallSession(profile);
    if (sessionError) {
      return { error: sessionError };
    }
    redirect(pathForStep(profile.step));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return { error: message(error) };
  }
}

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
  const bee = await loadBee();
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
  redirect(alreadyDone ? "/settings" : "/home");
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

export async function saveReminderAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireRecall({ min: "done", max: "done" });
  const time = field(formData, "time");
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { error: "Choose a time." };
  }
  const channel = field(formData, "channel") === "notification"
    ? "notification"
    : "email";
  try {
    await saveReminder(profile.id, { time, enabled: true, channel });
  } catch (error) {
    return { error: message(error) };
  }
  redirect("/home");
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

export async function signOutRecall() {
  await clearPending();
  await signOut();
}

function isMicStatus(value: string): value is MicStatus {
  return (
    value === "granted" ||
    value === "denied" ||
    value === "missing" ||
    value === "skipped" ||
    value === "unknown"
  );
}

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}
