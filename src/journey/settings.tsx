import { SettingsScreen } from "@/src/journey/settings-screen";
import { loadBee } from "@/src/platform/integrations/bee";
import { currentProfile } from "@/src/platform/recall/guard";
import { sectionLabel } from "@/src/platform/shell/ui";

export async function SettingsFlow({
  searchParams,
  embedded = false,
}: {
  searchParams: Promise<{ notice?: string }>;
  embedded?: boolean;
}) {
  const profile = await currentProfile();
  if (!profile?.emailVerifiedAt || profile.step !== "done") {
    return null;
  }
  const notice = (await searchParams).notice;
  const bee = profile.settings.beeEnabled ? await loadBee(profile.id) : null;
  const beeLabel = !profile.settings.beeEnabled
    ? "Not connected"
    : bee?.status === "ok"
      ? "Connected"
      : "Bee is quiet right now";

  return (
    <div className="text-stone-400">
      <p className={sectionLabel}>{embedded ? "Data share" : "Account"}</p>
      <h2 className="mt-3 text-[28px] font-medium tracking-tight text-stone-100">
        {embedded ? "Permissions" : "Settings"}
      </h2>
      {embedded ? (
        <p className="mt-2">
          Health data, day capture, and Bee. WHOOP sits with your status above.
        </p>
      ) : null}
      {notice === "password" ? (
        <p className="mt-3" role="status">
          Password saved.
        </p>
      ) : null}
      <div className="mt-4">
        <SettingsScreen profile={profile} beeLabel={beeLabel} />
      </div>
    </div>
  );
}
