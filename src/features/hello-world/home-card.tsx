"use client";

import { useState } from "react";

import { TalkSession } from "@/src/features/hello-world/talk-session";
import { Button, ButtonLink, sectionLabel } from "@/src/platform/shell/ui";
import { copy } from "@/src/platform/recall/copy";
import type { ClientProbe } from "@/src/platform/recall/answer-key";
import type { HomeStateId } from "@/src/platform/recall/types";

export type LaunchMap = {
  dashboard: string;
};

type TalkPayload = {
  narrative: string;
  answers: { id: string; answer: string }[];
};

function MicFix() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p>{copy.micBlocked}</p>
      <Button type="button" className="mt-4" onClick={() => setOpen(true)}>
        How to fix
      </Button>
      {open ? (
        <p className="mt-3 text-stone-400">
          Allow the microphone for this site in the browser’s site settings,
          then come back and hold to talk.
        </p>
      ) : null}
    </>
  );
}

export function HomeCard({
  state,
  name,
  probes,
  launches,
  consent,
  finishTalk,
}: {
  state: HomeStateId;
  name: string;
  probes: ClientProbe[];
  launches: LaunchMap;
  consent: React.ReactNode;
  finishTalk: (payload: TalkPayload) => Promise<{ error?: string; saved?: boolean }>;
}) {
  const canTalk =
    state !== "needs_consent" && state !== "mic_blocked" && state !== "done_today";

  return (
    <div className="flex min-h-[70vh] flex-col text-stone-400">
      <p className={sectionLabel}>Hello world</p>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight text-stone-100">
        Hello {name}
      </h1>
      <div className="mt-6 flex flex-1 flex-col items-center justify-center">
        {state === "needs_consent" ? consent : null}
        {state === "mic_blocked" ? <MicFix /> : null}
        {state === "done_today" ? <p className="text-center">{copy.doneToday}</p> : null}
        {canTalk ? <TalkSession probes={probes} finishTalk={finishTalk} /> : null}
      </div>
      <p className="mt-6">
        <ButtonLink href={launches.dashboard}>Dashboard</ButtonLink>
      </p>
    </div>
  );
}
