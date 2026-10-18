"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";

import { Door, doorButton } from "@/src/platform/shell/door";
import { FieldLabel } from "@/src/platform/shell/ui";
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
    <Door title="Choose a new password">
      <form action={action} className="mt-6">
        <input type="hidden" name="token" value={token} />
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
        <Submit />
      </form>
    </Door>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`mt-6 ${doorButton}`}>
      {pending ? "Please wait" : "Save password"}
    </button>
  );
}
