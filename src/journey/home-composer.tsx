"use client";

import { HomeCard, type LaunchMap } from "@/src/features/hello-world/home-card";
import { HealthForm } from "@/src/features/onboarding/health-form";
import type { ClientProbe } from "@/src/platform/recall/answer-key";
import type { HomeStateId } from "@/src/platform/recall/types";

type TalkPayload = {
  narrative: string;
  answers: { id: string; answer: string }[];
  poorSleep?: boolean;
  unwell?: boolean;
};

export function HomeComposer({
  state,
  name,
  probes,
  beeDay,
  launches,
  finishTalk,
}: {
  state: HomeStateId;
  name: string;
  probes: ClientProbe[];
  beeDay: string | null;
  launches: LaunchMap;
  finishTalk: (payload: TalkPayload) => Promise<{ error?: string; saved?: boolean }>;
}) {
  return (
    <HomeCard
      state={state}
      name={name}
      probes={probes}
      beeDay={beeDay}
      launches={launches}
      consent={<HealthForm />}
      finishTalk={finishTalk}
    />
  );
}
