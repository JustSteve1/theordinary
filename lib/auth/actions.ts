"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  sessionSecret,
} from "@/lib/auth/session";
import { authenticateUser, createUser } from "@/lib/auth/users";

export type AuthState = {
  error: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function startSession(userId: string) {
  const secret = sessionSecret();
  if (!secret) {
    return "Add SESSION_SECRET to the server environment before signing in.";
  }

  const token = await createSessionToken(userId, secret);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  return null;
}

export async function signUp(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = field(formData, "name");
  const email = field(formData, "email");
  const password = formData.get("password");
  const passwordValue = typeof password === "string" ? password : "";

  if (name.length < 1 || name.length > 80) {
    return { error: "Enter your name." };
  }
  if (!validEmail(email)) {
    return { error: "Enter a valid email." };
  }
  if (passwordValue.length < 8) {
    return { error: "Use at least 8 characters for your password." };
  }

  try {
    const user = await createUser({ name, email, password: passwordValue });
    const sessionError = await startSession(user.id);
    if (sessionError) {
      return { error: sessionError };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create the account.";
    return { error: message };
  }

  redirect("/app");
}

export async function logIn(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = field(formData, "email");
  const password = formData.get("password");
  const passwordValue = typeof password === "string" ? password : "";

  if (!validEmail(email) || passwordValue.length === 0) {
    return { error: "Email or password is incorrect." };
  }

  const user = await authenticateUser(email, passwordValue);
  if (!user) {
    return { error: "Email or password is incorrect." };
  }

  const sessionError = await startSession(user.id);
  if (sessionError) {
    return { error: sessionError };
  }

  redirect("/app");
}

export async function signOut() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  redirect("/login");
}
