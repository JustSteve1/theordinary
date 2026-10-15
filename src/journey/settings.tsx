import { SettingsScreen } from "@/src/journey/settings-screen";
import { loadBee } from "@/src/platform/integrations/bee";
import { requireRecall } from "@/src/platform/recall/guard";

export async function SettingsFlow({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const notice = (await searchParams).notice;
  const bee = profile.settings.beeEnabled ? await loadBee() : null;
  const beeLabel = !profile.settings.beeEnabled
    ? "Not connected"
    : bee?.status === "ok"
      ? "Connected"
      : "Bee is quiet right now";

  return (
    <div>
      <h1 className="text-[28px] font-medium tracking-tight">Settings</h1>
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
