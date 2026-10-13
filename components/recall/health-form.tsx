"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/recall/ui";
import { acceptHealth, signOutRecall, type FormState } from "@/lib/recall/actions";
import { copy } from "@/lib/recall/copy";

export function HealthForm() {
  const [state, action] = useActionState(acceptHealth, {} as FormState);
  const [checked, setChecked] = useState(false);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <label className="flex min-h-12 items-start gap-3">
          <input
            type="checkbox"
            name="health"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-1 size-5"
          />
          <span>{copy.healthConsent}</span>
        </label>
        <p className="text-[#d6d3d1]">{copy.healthWithdraw}</p>
        {state.error ? (
          <p className="text-[#ffb4ab]" role="alert">
            {state.error}
          </p>
        ) : null}
        <Submit disabled={!checked} />
      </form>
      <p>{copy.healthDecline}</p>
      <form action={signOutRecall}>
        <Button type="submit" variant="quiet">
          Sign out
        </Button>
      </form>
    </div>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} className="w-full">
      {pending ? "Saving…" : "Continue"}
    </Button>
  );
}
