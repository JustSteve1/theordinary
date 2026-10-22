import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { demoAllowed, loadDemoSnapshot, loadLiveScore } from "@/src/features/demo/load";
import { DemoView } from "@/src/features/demo/view";
import { getCurrentUser } from "@/src/platform/current-user";
import { PREVIEW_COOKIE_NAME } from "@/src/platform/site";

const EXPERIMENT_ID = "barbara-dry-run";

export async function DemoScreen() {
  const user = await getCurrentUser();
  const preview = (await cookies()).get(PREVIEW_COOKIE_NAME)?.value === process.env.SITE_PREVIEW_SECRET;
  if (!demoAllowed({ email: user?.email, preview })) {
    notFound();
  }
  const snapshot = await loadDemoSnapshot(EXPERIMENT_ID);
  if (!snapshot) {
    notFound();
  }
  const score = await loadLiveScore();
  return <DemoView snapshot={snapshot} score={score} />;
}
