import type { Metadata } from "next";

import { ChatTile } from "@/src/features/chat/tile";
import { MembershipScreen } from "@/src/features/dashboard";
import { SettingsFlow } from "@/src/journey/settings";
import { TrendPanel } from "@/src/journey/trend-panel";
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
    <div className="space-y-8">
      <ChatTile />
      <MembershipScreen searchParams={Promise.resolve({ whoop: params.whoop })} />
      {ready ? (
        <TrendPanel profileId={profile.id} fixture={params.fixture} />
      ) : null}
      {ready ? <SettingsFlow searchParams={Promise.resolve(params)} embedded /> : null}
    </div>
  );
}
