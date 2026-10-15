"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/src/platform/shell/ui";
import { acceptHealth } from "@/src/features/onboarding/actions";
import { signOutRecall } from "@/src/platform/auth-actions";
import type { FormState } from "@/src/platform/recall/form";
import { copy } from "@/src/platform/recall/copy";

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
        <p className="text-stone-400">{copy.healthWithdraw}</p>
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
