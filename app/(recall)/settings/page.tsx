import type { Metadata } from "next";

import { SettingsControls } from "@/components/recall/settings-controls";
import { requireRecall } from "@/lib/recall/guard";
import { loadBee } from "@/lib/integrations/bee/client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
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
        <SettingsControls profile={profile} beeLabel={beeLabel} />
      </div>
    </div>
  );
}
