import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createWhoopState,
  whoopAuthorizeUrl,
  whoopConfig,
} from "@/lib/integrations/whoop/client";
import { getCurrentUser } from "@/lib/users";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const config = whoopConfig();
  if (!config) {
    redirect("/app?whoop=unconfigured");
  }

  const state = createWhoopState();
  const jar = await cookies();
  jar.set("whoop_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  redirect(whoopAuthorizeUrl(config, state).toString());
}
