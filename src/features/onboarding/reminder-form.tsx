"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Panel } from "@/src/platform/shell/ui";
import { saveReminderAction } from "@/src/features/onboarding/actions";
import type { FormState } from "@/src/platform/recall/form";
import { recallDefaults } from "@/src/platform/recall/defaults";

const presets = ["08:00", "10:00", "18:00", "21:00"];

export function ReminderForm({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose?: () => void;
  current?: string;
}) {
  const [state, action] = useActionState(saveReminderAction, {} as FormState);
  const [time, setTime] = useState(current || recallDefaults.reminderDefault);
  const [channel, setChannel] = useState("email");

  if (!open) {
    return null;
  }

  async function pick(next: string) {
    setTime(next);
    if (typeof Notification === "undefined") {
      setChannel("email");
      return;
    }
    const permission = await Notification.requestPermission();
    setChannel(permission === "granted" ? "notification" : "email");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-title"
      className="mt-4"
    >
      <Panel>
        <h2 id="reminder-title" className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          When would you like a nudge to check in?
        </h2>
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="time" value={time} />
          <input type="hidden" name="channel" value={channel} />
          <div className="grid grid-cols-2 gap-3">
            {presets.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={time === preset ? "primary" : "secondary"}
                onClick={() => pick(preset)}
              >
                {preset}
              </Button>
            ))}
          </div>
          <label className="block">
            <span>Custom time</span>
            <input
              type="time"
              value={time}
              onChange={(event) => pick(event.target.value)}
              className="mt-1 min-h-12 w-full rounded-[10px] border border-white/15 bg-transparent px-3"
            />
          </label>
          <p className="text-stone-400">
            {channel === "notification"
              ? "This browser will show a notification."
              : "We’ll use email if notifications are off."}
          </p>
          {state.error ? (
            <p className="text-[#ffb4ab]" role="alert">
              {state.error}
            </p>
          ) : null}
          <Submit />
          {onClose ? (
            <Button type="button" variant="quiet" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </form>
      </Panel>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : "Save reminder"}
    </Button>
  );
}
