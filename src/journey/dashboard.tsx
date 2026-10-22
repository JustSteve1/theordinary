import type { Metadata } from "next";
import Link from "next/link";

import { ChatTile } from "@/src/features/chat/tile";
import { MembershipScreen } from "@/src/features/dashboard";
import { IntegrationsPanel } from "@/src/features/integrations/panel";
import { CheckinPanel } from "@/src/journey/checkin-panel";
import { SettingsFlow } from "@/src/journey/settings";
import { ScoresPanel } from "@/src/journey/scores-panel";
import { TrendPanel } from "@/src/journey/trend-panel";
import { nudgesFlagEnabled } from "@/src/platform/nudges";
import { currentProfile } from "@/src/platform/recall/guard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ whoop?: string; fixture?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const profile = await currentProfile();
  const ready = profile?.step === "done" && profile.emailVerifiedAt;

  return (
    <div className="space-y-6">
      <ChatTile />
      <IntegrationsPanel notice={params.whoop} />
      <MembershipScreen />
      {ready ? (
        <TrendPanel profileId={profile.id} fixture={params.fixture} />
      ) : null}
      {ready ? <CheckinPanel profileId={profile.id} /> : null}
      {ready ? <ScoresPanel profileId={profile.id} /> : null}
      {ready && nudgesFlagEnabled() ? (
        <p className="text-sm">
          <Link href="/app/nudges" className="text-[#0a84ff]">
            Nudges
          </Link>
        </p>
      ) : null}
      {ready ? (
        <SettingsFlow searchParams={Promise.resolve(params)} embedded />
      ) : null}
    </div>
  );
}
