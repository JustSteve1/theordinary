"use server";

import { redirect } from "next/navigation";

import { hashPassword } from "@/src/platform/password";
import { recallDefaults } from "@/src/platform/recall/defaults";
import {
  appOrigin,
  field,
  isRedirectError,
  message,
  unreachable,
  validEmail,
  type FormState,
} from "@/src/platform/recall/form";
import { pathForStep } from "@/src/platform/recall/paths";
import { issueRecallSession } from "@/src/platform/recall/session";
import {
  clearAttempts,
  clearDraft,
  readAttempts,
  readDraft,
  readPending,
  writeAttempts,
  writeDraft,
  writePending,
} from "@/src/platform/recall/cookies";
import {
  changePendingEmail,
  clearFailedLogins,
  consumeEmailToken,
  createPendingMember,
  findAuthByEmail,
  getRecallProfile,
  issueEmailToken,
  lockActive,
  passwordMatches,
  recordFailedLogin,
  sendVerificationEmail,
  setPassword,
} from "@/src/platform/recall/store";

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
    redirect("/home");
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
