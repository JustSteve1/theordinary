"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Panel } from "@/components/recall/ui";
import { connectBee, finishBee, type FormState } from "@/lib/recall/actions";
import { copy } from "@/lib/recall/copy";

export function BeeStep({ dayCapture }: { dayCapture: boolean }) {
  const [warn, setWarn] = useState(false);
  const [state, action] = useActionState(finishBee, {} as FormState);
  const [connectState, connectAction] = useActionState(connectBee, {} as FormState);

  return (
    <div className="space-y-4">
      <Panel>
        <p>
          Have a Bee? Connect it and Recall can use what it captured instead of,
          or as well as, day capture.
        </p>
        <form action={connectAction}>
          <ConnectSubmit />
        </form>
        {connectState.error ? (
          <p className="mt-3 text-[#ffb4ab]" role="alert">
            {connectState.error}
          </p>
        ) : null}
      </Panel>
      {dayCapture ? (
        <form action={action}>
          <Submit label="Skip" secondary />
        </form>
      ) : warn ? (
        <Panel>
          <p>{copy.noSourceWarning}</p>
          <form action={action} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="day_capture" value="on" />
            <Submit label="Turn on day capture" />
          </form>
          <form action={action} className="mt-3">
            <Submit label="Set up later" secondary />
          </form>
          {state.error ? (
            <p className="mt-3 text-[#ffb4ab]" role="alert">
              {state.error}
            </p>
          ) : null}
        </Panel>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setWarn(true)}>
          Skip
        </Button>
      )}
    </div>
  );
}

function ConnectSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="mt-4" disabled={pending}>
      {pending ? "Connecting…" : "Connect Bee"}
    </Button>
  );
}

function Submit({
  label,
  secondary = false,
}: {
  label: string;
  secondary?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={secondary ? "secondary" : "primary"}
      disabled={pending}
      className="w-full"
    >
      {pending ? "Saving…" : label}
    </Button>
  );
}
