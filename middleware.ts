import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  sessionSecret,
  verifySessionToken,
} from "@/src/platform/session";
import { pathForStep, welcomeAllowed } from "@/src/platform/recall/paths";
import { PREVIEW_COOKIE_NAME, isDevelopment } from "@/src/platform/site";

function isLaunched(): boolean {
  return process.env.NEXT_PUBLIC_SITE_LAUNCHED === "true";
}

function hasPreviewAccess(request: NextRequest): boolean {
  const secret = process.env.SITE_PREVIEW_SECRET;
  if (!secret) {
    return false;
  }

  const previewParam = request.nextUrl.searchParams.get("preview");
  if (previewParam === secret) {
    return true;
  }

  return request.cookies.get(PREVIEW_COOKIE_NAME)?.value === secret;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|og-image.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

function isPublicRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/dev/hello" ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname === "/verify" ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/reset" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/map"
  );
}

function isRecallAppRoute(pathname: string) {
  return (
    pathname === "/home" ||
    pathname.startsWith("/checkin") ||
    pathname === "/dashboard" ||
    pathname === "/settings"
  );
}

function isMemberRoute(pathname: string) {
  return pathname.startsWith("/app") || pathname.startsWith("/api/whoop");
}

function continueWithPath(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-recall-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const launched = isLaunched();
  const previewAccess = hasPreviewAccess(request);
  const canAccessApp = launched || isDevelopment() || previewAccess;

  if (previewAccess && request.nextUrl.searchParams.has("preview")) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("preview");
    const response = NextResponse.redirect(url);
    response.cookies.set(
      PREVIEW_COOKIE_NAME,
      process.env.SITE_PREVIEW_SECRET!,
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      },
    );
    return response;
  }

  if (pathname.startsWith("/api/health")) {
    return continueWithPath(request);
  }

  if (isPublicRoute(pathname)) {
    return continueWithPath(request);
  }

  if (pathname.startsWith("/api/whoop/callback")) {
    return continueWithPath(request);
  }

  const secret = sessionSecret();
  const session = secret
    ? await verifySessionToken(
        request.cookies.get(SESSION_COOKIE)?.value,
        secret,
      )
    : null;

  if (pathname.startsWith("/welcome") || isRecallAppRoute(pathname)) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (!session.verified) {
      return NextResponse.redirect(new URL("/signup/verify", request.url));
    }
    if (pathname.startsWith("/welcome")) {
      if (session.step === "done") {
        return NextResponse.redirect(new URL("/home", request.url));
      }
      if (!welcomeAllowed(session.step, pathname)) {
        return NextResponse.redirect(
          new URL(pathForStep(session.step), request.url),
        );
      }
      return continueWithPath(request);
    }
    if (session.step !== "done" && pathname !== "/home") {
      return NextResponse.redirect(
        new URL(pathForStep(session.step), request.url),
      );
    }
    const response = continueWithPath(request);
    if (pathname === "/home" || pathname === "/dashboard") {
      response.cookies.set("recall_reveal", "", { path: "/", maxAge: 0 });
    }
    return response;
  }

  if (isMemberRoute(pathname)) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return continueWithPath(request);
  }

  if (canAccessApp) {
    return continueWithPath(request);
  }

  return NextResponse.rewrite(new URL("/", request.url));
}
