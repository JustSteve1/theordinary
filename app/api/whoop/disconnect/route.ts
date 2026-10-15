import { redirect } from "next/navigation";

import { disconnectWhoop } from "@/src/platform/integrations/whoop";
import { getCurrentUser } from "@/src/platform/current-user";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  await disconnectWhoop(user.id);
  redirect("/app");
}
