"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";

import { Button, FieldLabel, Panel, RecallFrame } from "@/src/platform/shell/ui";
import { resetPassword } from "@/src/features/account/actions";
import type { FormState } from "@/src/platform/recall/form";

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [state, action] = useActionState(resetPassword, {} as FormState);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

  return (
    <RecallFrame>
      <form action={action}>
        <Panel>
          <h1 className="text-[28px] font-medium tracking-tight">Choose a new password</h1>
          <input type="hidden" name="token" value={token} />
          <div className="mt-4">
            <FieldLabel
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              error={state.error}
              showPassword={show}
              onTogglePassword={() => setShow((current) => !current)}
            />
          </div>
          <Submit />
        </Panel>
      </form>
    </RecallFrame>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-4">
      {pending ? "Saving…" : "Save password"}
    </Button>
  );
}
