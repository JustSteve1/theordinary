import { NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  sessionSecret,
} from "@/src/platform/session";
import { writePending } from "@/src/platform/recall/cookies";
import { pathForStep } from "@/src/platform/recall/paths";
import {
  consumeEmailToken,
  findAuthByEmail,
  getRecallProfile,
  markEmailVerified,
} from "@/src/platform/recall/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/signup/verify?error=expired", url));
  }

  const consumed = await consumeEmailToken(token, "verify");
  if (consumed.status !== "ok") {
    if (consumed.status === "expired" && consumed.email) {
      const row = await findAuthByEmail(consumed.email);
      if (row) {
        await writePending(row.id);
      }
    }
    return NextResponse.redirect(new URL("/signup/verify?error=expired", url));
  }

  await markEmailVerified(consumed.userId);
  const profile = await getRecallProfile(consumed.userId);
  const secret = sessionSecret();
  if (!profile || !secret) {
    return NextResponse.redirect(new URL("/login", url));
  }

  const session = await createSessionToken(profile.id, secret, {
    verified: true,
    step: profile.step,
  });
  const response = NextResponse.redirect(new URL(pathForStep(profile.step), url));
  response.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  return response;
}
