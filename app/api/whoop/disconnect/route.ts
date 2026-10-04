import { redirect } from "next/navigation";

import { disconnectWhoop } from "@/lib/integrations/whoop/client";
import { getCurrentUser } from "@/lib/users";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  await disconnectWhoop(user.id);
  redirect("/app");
}
