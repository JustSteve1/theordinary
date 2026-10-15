"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, FieldLabel, Panel } from "@/src/platform/shell/ui";
import { signOutRecall } from "@/src/platform/auth-actions";
import type { FormState } from "@/src/platform/recall/form";
import type { RecallProfile } from "@/src/platform/recall/types";
import {
  changePassword,
  disconnectBee,
  removeAccount,
  removeCheckins,
  setDayCapture,
  setReminderEnabled,
  updateMic,
  withdrawConsent,
} from "@/src/features/settings/actions";

export function SettingsControls({
  profile,
  beeLabel,
  connectBee,
  ReminderForm,
}: {
  profile: RecallProfile;
  beeLabel: string;
  connectBee: () => Promise<FormState>;
  ReminderForm: (props: {
    open: boolean;
    onClose: () => void;
    current?: string;
  }) => React.ReactNode;
}) {
  const [reminder, setReminder] = useState(false);

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">Privacy and consent</h2>
        <p className="mt-2">
          {profile.consent.healthAcceptedAt
            ? `Health-data consent given on ${new Date(profile.consent.healthAcceptedAt).toLocaleDateString("en-GB")}.`
            : "Health-data consent is not in place."}
        </p>
        <Confirm
          label="Withdraw consent"
          warning="Withdraw health-data consent? Check-ins will stop until you agree again."
          confirmLabel="Withdraw consent"
          cancelLabel="Keep consent"
          action={withdrawConsent}
        />
        <Confirm
          label="Delete all my check-in data"
          warning="Delete all your check-in data? Your account stays."
          confirmLabel="Delete check-ins"
          cancelLabel="Keep them"
          action={removeCheckins}
        />
      </Panel>
      <Panel>
        <h2 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">Microphone and day capture</h2>
        <p className="mt-2">Microphone: {profile.settings.micStatus}</p>
        <MicUpdate />
        <form action={setDayCapture} className="mt-4">
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              name="day_capture"
              defaultChecked={profile.settings.dayCapture}
              className="size-5"
            />
            Turn on day capture
          </label>
          <Button type="submit" variant="secondary" className="mt-3">
            Save day capture
          </Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">Bee</h2>
        <p className="mt-2">{beeLabel}</p>
        {profile.settings.beeEnabled ? (
          <form action={disconnectBee} className="mt-3">
            <Button type="submit" variant="secondary">
              Disconnect Bee
            </Button>
          </form>
        ) : (
          <ConnectBee connectBee={connectBee} />
        )}
      </Panel>
      <Panel>
        <h2 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">Reminders</h2>
        <p className="mt-2">
          {profile.settings.reminderEnabled
            ? `On at ${profile.settings.reminderTime}, by ${profile.settings.reminderChannel}.`
            : "Off"}
        </p>
        <Button type="button" className="mt-3" onClick={() => setReminder(true)}>
          Choose a time
        </Button>
        <ReminderForm
          open={reminder}
          onClose={() => setReminder(false)}
          current={profile.settings.reminderTime}
        />
        <form action={setReminderEnabled} className="mt-3">
          <input
            type="hidden"
            name="enabled"
            value={profile.settings.reminderEnabled ? "" : "on"}
          />
          <Button type="submit" variant="secondary">
            {profile.settings.reminderEnabled ? "Turn reminders off" : "Turn reminders on"}
          </Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">Account</h2>
        <p className="mt-2">{profile.email}</p>
        <PasswordForm />
        <form action={signOutRecall} className="mt-4">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
        <Confirm
          label="Delete account"
          warning="Delete your account? Your check-ins and sign-in will be removed."
          confirmLabel="Delete account"
          cancelLabel="Keep account"
          action={removeAccount}
        />
      </Panel>
    </div>
  );
}

function MicUpdate() {
  const [state, action] = useActionState(updateMic, {} as FormState);
  const [status, setStatus] = useState("unknown");

  async function allow() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setStatus("granted");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStatus(name === "NotFoundError" ? "missing" : "denied");
    }
  }

  return (
    <form action={action} className="mt-3 flex flex-col items-start gap-3">
      <input type="hidden" name="mic_status" value={status} />
      <Button type="button" onClick={allow}>
        Allow microphone
      </Button>
      {state.error ? (
        <p className="text-[#ffb4ab]" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={status === "unknown"}>
        Save microphone
      </Button>
    </form>
  );
}

function ConnectBee({
  connectBee,
}: {
  connectBee: () => Promise<FormState>;
}) {
  const [state, action] = useActionState(connectBee, {} as FormState);
  return (
    <form action={action} className="mt-3">
      <ConnectSubmit />
      {state.error ? (
        <p className="mt-2 text-[#ffb4ab]" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function ConnectSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Connecting…" : "Connect Bee"}
    </Button>
  );
}

function PasswordForm() {
  const [state, action] = useActionState(changePassword, {} as FormState);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  return (
    <form action={action} className="mt-4 space-y-3">
      <FieldLabel
        label="Current password"
        name="current"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={setCurrent}
      />
      <FieldLabel
        label="New password"
        name="next"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={setNext}
        error={state.error}
      />
      <SavePassword />
    </form>
  );
}

function SavePassword() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Saving…" : "Change password"}
    </Button>
  );
}

function Confirm({
  label,
  warning,
  confirmLabel,
  cancelLabel,
  action,
}: {
  label: string;
  warning: string;
  confirmLabel: string;
  cancelLabel: string;
  action: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="secondary" className="mt-3" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="mt-3 rounded-[10px] border border-white/10 p-4">
      <p>{warning}</p>
      <form action={action} className="mt-3">
        <Button type="submit">{confirmLabel}</Button>
      </form>
      <Button type="button" variant="quiet" className="mt-2" onClick={() => setOpen(false)}>
        {cancelLabel}
      </Button>
    </div>
  );
}
