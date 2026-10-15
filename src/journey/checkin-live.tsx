import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { VoiceSession } from "@/src/features/check-in/voice-session";
import { requireRecall } from "@/src/platform/recall/guard";
import { isMockScenario, type MockScenario } from "@/src/features/check-in/script";
import { loadHomeContext } from "@/src/features/hello-world/load";

export const metadata: Metadata = { title: "Check-in" };

export default async function LiveCheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const { state } = await loadHomeContext(profile);
  const requested = (await searchParams).scenario;
  const preview =
    process.env.NODE_ENV === "development" && isMockScenario(requested);
  if (state !== "ready" && !preview) {
    redirect("/home");
  }
  const scenario: MockScenario =
    process.env.NODE_ENV === "development" && isMockScenario(requested)
      ? requested
      : "happy";

  return (
    <div>
      <h1 className="sr-only">Check-in</h1>
      <VoiceSession scenario={scenario} />
    </div>
  );
}
