import type { Metadata } from "next";

import { NudgeInbox } from "@/src/features/nudges/inbox";
import { requireRecall } from "@/src/platform/recall/guard";

export const metadata: Metadata = { title: "Nudges" };

export default async function NudgesScreen() {
  const profile = await requireRecall({ min: "done", max: "done" });
  return <NudgeInbox userId={profile.id} />;
}
