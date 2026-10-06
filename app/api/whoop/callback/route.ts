import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { connectWhoop } from "@/lib/integrations/whoop/client";
import { getCurrentUser } from "@/lib/users";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("whoop_oauth_state")?.value;
  jar.set("whoop_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  if (!code || !state || state !== expected || state.length !== 8) {
    redirect("/app/connections?whoop=error");
  }

  try {
    await connectWhoop({ userId: user.id, code });
  } catch {
    redirect("/app/connections?whoop=error");
  }

  redirect("/app/connections");
}
