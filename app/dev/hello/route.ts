import { NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  sessionSecret,
} from "@/lib/auth/session";
import { findAuthByEmail, getRecallProfile } from "@/lib/recall/store";
import { isDevelopment } from "@/lib/site-config";

/** Local account the MVP 1.1 work opens on. */
const HELLO_EMAIL = "steve@440hz.uk";

export async function GET() {
  if (!isDevelopment()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const auth = await findAuthByEmail(HELLO_EMAIL);
  const profile = auth ? await getRecallProfile(auth.id) : null;
  const secret = sessionSecret();
  if (!profile || !secret) {
    return new NextResponse(null, {
      status: 307,
      headers: { Location: "/login" },
    });
  }

  const session = await createSessionToken(profile.id, secret, {
    verified: Boolean(profile.emailVerifiedAt),
    step: profile.step,
  });
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: "/home" },
  });
  response.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  return response;
}
