"use client";

import { HomeCard, type LaunchMap } from "@/src/features/hello-world/home-card";
import { HealthForm } from "@/src/features/onboarding/health-form";
import { ReminderForm } from "@/src/features/onboarding/reminder-form";
import type { HomeStateId } from "@/src/platform/recall/types";

export function HomeComposer({
  state,
  name,
  quietBee,
  launches,
}: {
  state: HomeStateId;
  name: string;
  quietBee: boolean;
  launches: LaunchMap;
}) {
  return (
    <HomeCard
      state={state}
      name={name}
      quietBee={quietBee}
      launches={launches}
      consent={<HealthForm />}
      reminder={(props) => <ReminderForm {...props} />}
    />
  );
}
