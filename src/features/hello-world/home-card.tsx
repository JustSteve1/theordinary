"use client";

import { useState } from "react";

import { Button, ButtonLink, Panel, sectionLabel } from "@/src/platform/shell/ui";
import { copy } from "@/src/platform/recall/copy";
import type { HomeStateId } from "@/src/platform/recall/types";

export type LaunchMap = {
  checkin: string;
  trend: string;
  dashboard: string;
  settings: string;
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
          then come back to Settings and allow it again.
        </p>
      ) : null}
    </>
  );
}

export function HomeCard({
  state,
  name,
  quietBee,
  launches,
  consent,
  reminder,
}: {
  state: HomeStateId;
  name: string;
  quietBee: boolean;
  launches: LaunchMap;
  consent: React.ReactNode;
  reminder: (props: { open: boolean; onClose: () => void }) => React.ReactNode;
}) {
  const [reminderOpen, setReminderOpen] = useState(false);

  return (
    <Panel className="bg-white/[0.03]">
      <p className={sectionLabel}>Hello world</p>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight">Hello {name}</h1>
      <div className="mt-4 space-y-4 text-[13px] leading-5 text-stone-400">
        {state === "needs_consent" ? consent : null}
        {state === "day1" ? (
          <>
            <p>{copy.day1}</p>
            <Button type="button" className="mt-4" onClick={() => setReminderOpen(true)}>
              Set a reminder
            </Button>
            {reminder({ open: reminderOpen, onClose: () => setReminderOpen(false) })}
          </>
        ) : null}
        {state === "ready" ? (
          <>
            <p>{copy.ready}</p>
            <div className="mt-4">
              <ButtonLink href={launches.checkin}>Start check-in</ButtonLink>
            </div>
          </>
        ) : null}
        {state === "not_enough_data" ? (
          <>
            <p>{copy.notEnough}</p>
            {quietBee ? <p className="mt-2">Bee is quiet right now.</p> : null}
            <p className="mt-4">
              <ButtonLink href={launches.settings} variant="secondary">
                Go to Settings
              </ButtonLink>
            </p>
          </>
        ) : null}
        {state === "no_source" ? (
          <>
            <p>{copy.noSource}</p>
            <p className="mt-4">
              <ButtonLink href={launches.settings}>Go to Settings</ButtonLink>
            </p>
          </>
        ) : null}
        {state === "mic_blocked" ? <MicFix /> : null}
        {state === "done_today" ? (
          <>
            <p>{copy.doneToday}</p>
            <p className="mt-4">
              <ButtonLink href={launches.trend} variant="secondary">
                View dashboard
              </ButtonLink>
            </p>
          </>
        ) : null}
      </div>
      <p className="mt-6 flex gap-4">
        <ButtonLink href={launches.trend}>Dashboard</ButtonLink>
        <ButtonLink href={launches.dashboard}>Membership</ButtonLink>
      </p>
    </Panel>
  );
}
