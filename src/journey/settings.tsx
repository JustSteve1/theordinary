import { SettingsScreen } from "@/src/journey/settings-screen";
import { loadBee } from "@/src/platform/integrations/bee";
import { requireRecall } from "@/src/platform/recall/guard";
import { sectionLabel } from "@/src/platform/shell/ui";

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
    <div className="text-stone-400">
      <p className={sectionLabel}>Account</p>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight text-stone-100">
        Settings
      </h1>
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
