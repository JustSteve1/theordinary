"use client";

import { connectBee } from "@/src/features/onboarding/actions";
import { ReminderForm } from "@/src/features/onboarding/reminder-form";
import { SettingsControls } from "@/src/features/settings/settings-controls";
import type { RecallProfile } from "@/src/platform/recall/types";

export function SettingsScreen({
  profile,
  beeLabel,
}: {
  profile: RecallProfile;
  beeLabel: string;
}) {
  return (
    <SettingsControls
      profile={profile}
      beeLabel={beeLabel}
      connectBee={connectBee}
      ReminderForm={ReminderForm}
    />
  );
}
