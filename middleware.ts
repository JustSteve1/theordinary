import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  sessionSecret,
  verifySessionToken,
} from "@/lib/auth/session";
import { PREVIEW_COOKIE_NAME, isDevelopment } from "@/lib/site-config";

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

function isAuthRoute(pathname: string) {
  return pathname === "/signup" || pathname === "/login";
}

function isMemberRoute(pathname: string) {
  return pathname.startsWith("/app") || pathname.startsWith("/api/whoop");
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
    return NextResponse.next();
  }

  if (pathname === "/" || isAuthRoute(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/whoop/callback")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/bee/snapshot")) {
    return NextResponse.next();
  }

  if (isMemberRoute(pathname)) {
    const secret = sessionSecret();
    const session = secret
      ? await verifySessionToken(
          request.cookies.get(SESSION_COOKIE)?.value,
          secret,
        )
      : null;
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  if (canAccessApp) {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL("/", request.url));
}
