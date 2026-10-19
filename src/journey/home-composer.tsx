"use client";

import { HomeCard, type LaunchMap } from "@/src/features/hello-world/home-card";
import type { TalkPayload } from "@/src/features/hello-world/talk-payload";
import { HealthForm } from "@/src/features/onboarding/health-form";
import type { TalkScript } from "@/src/platform/recall/probe-timing";
import type { HomeStateId } from "@/src/platform/recall/types";

export function HomeComposer({
  state,
  name,
  script,
  beeDay,
  neededToday,
  lastShort,
  launches,
  finishTalk,
}: {
  state: HomeStateId;
  name: string;
  script: TalkScript;
  beeDay: string | null;
  neededToday: boolean;
  lastShort: boolean;
  launches: LaunchMap;
  finishTalk: (payload: TalkPayload) => Promise<{ error?: string; saved?: boolean }>;
}) {
  return (
    <HomeCard
      state={state}
      name={name}
      script={script}
      beeDay={beeDay}
      neededToday={neededToday}
      lastShort={lastShort}
      launches={launches}
      consent={<HealthForm />}
      finishTalk={finishTalk}
    />
  );
}
