"use client";

import { useState } from "react";

import { HealthForm } from "@/components/recall/health-form";
import { ReminderForm } from "@/components/recall/reminder-form";
import { Button, ButtonLink, Panel } from "@/components/recall/ui";
import { copy } from "@/lib/recall/copy";
import type { HomeStateId } from "@/lib/recall/types";

function MicFix() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p>{copy.micBlocked}</p>
      <Button type="button" className="mt-4" onClick={() => setOpen(true)}>
        How to fix
      </Button>
      {open ? (
        <p className="mt-3 text-[#d6d3d1]">
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
}: {
  state: HomeStateId;
  name: string;
  quietBee: boolean;
}) {
  const [reminder, setReminder] = useState(false);

  return (
    <div>
      <h1 className="text-[32px] font-medium tracking-tight">Hello {name}</h1>
      <Panel className="mt-6">
        {state === "needs_consent" ? <HealthForm /> : null}
        {state === "day1" ? (
          <>
            <p>{copy.day1}</p>
            <Button type="button" className="mt-4" onClick={() => setReminder(true)}>
              Set a reminder
            </Button>
            <ReminderForm open={reminder} onClose={() => setReminder(false)} />
          </>
        ) : null}
        {state === "ready" ? (
          <>
            <p>{copy.ready}</p>
            <div className="mt-4">
              <ButtonLink href="/checkin">Start check-in</ButtonLink>
            </div>
          </>
        ) : null}
        {state === "not_enough_data" ? (
          <>
            <p>{copy.notEnough}</p>
            {quietBee ? <p className="mt-2">Bee is quiet right now.</p> : null}
            <p className="mt-4">
              <ButtonLink href="/settings" variant="secondary">
                Go to Settings
              </ButtonLink>
            </p>
          </>
        ) : null}
        {state === "no_source" ? (
          <>
            <p>{copy.noSource}</p>
            <p className="mt-4">
              <ButtonLink href="/settings">Go to Settings</ButtonLink>
            </p>
          </>
        ) : null}
        {state === "mic_blocked" ? <MicFix /> : null}
        {state === "done_today" ? (
          <>
            <p>{copy.doneToday}</p>
            <p className="mt-4">
              <ButtonLink href="/dashboard" variant="secondary">
                View dashboard
              </ButtonLink>
            </p>
          </>
        ) : null}
      </Panel>
      <p className="mt-4">
        <ButtonLink href="/dashboard" variant="quiet">
          Dashboard
        </ButtonLink>
      </p>
    </div>
  );
}
