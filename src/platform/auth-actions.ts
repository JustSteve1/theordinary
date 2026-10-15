"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { clearPending } from "@/src/platform/recall/cookies";
import { SESSION_COOKIE, sessionCookieOptions } from "@/src/platform/session";

export async function signOut() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  redirect("/login");
}

export async function signOutRecall() {
  await clearPending();
  await signOut();
}
