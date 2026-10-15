import { cookies } from "next/headers";

import {
  SESSION_COOKIE,
  sessionSecret,
  verifySessionToken,
} from "@/src/platform/session";
import { findUserById, type PublicUser } from "@/src/platform/members";

export async function getCurrentUser(): Promise<PublicUser | null> {
  const secret = sessionSecret();
  if (!secret) {
    return null;
  }

  const jar = await cookies();
  const session = await verifySessionToken(
    jar.get(SESSION_COOKIE)?.value,
    secret,
  );
  if (!session) {
    return null;
  }

  return findUserById(session.userId);
}
