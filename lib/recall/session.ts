import { cookies } from "next/headers";

import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  sessionSecret,
  verifySessionToken,
} from "@/lib/auth/session";
import type { RecallProfile } from "@/lib/recall/types";

export async function issueRecallSession(profile: RecallProfile) {
  const secret = sessionSecret();
  if (!secret) {
    return "Add SESSION_SECRET to the server environment before signing in.";
  }

  const token = await createSessionToken(profile.id, secret, {
    verified: Boolean(profile.emailVerifiedAt),
    step: profile.step,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  return null;
}

export async function readRecallSession() {
  const secret = sessionSecret();
  if (!secret) {
    return null;
  }
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value, secret);
}

export async function clearRecallSession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", sessionCookieOptions(0));
}
