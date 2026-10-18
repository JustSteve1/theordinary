"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useFormStatus } from "react-dom";

import { Door, doorButton } from "@/src/platform/shell/door";
import { FieldLabel } from "@/src/platform/shell/ui";
import { requestPasswordReset } from "@/src/features/account/actions";
import type { FormState } from "@/src/platform/recall/form";

export default function ForgotPage() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}

function ForgotForm() {
  const params = useSearchParams();
  const sent = params.get("sent") === "1";
  const link = params.get("link");
  const [state, action] = useActionState(requestPasswordReset, {} as FormState);
  const [email, setEmail] = useState("");

  return (
    <Door
      title="Reset your password"
      detail={
        sent
          ? "If an account exists for that email, we’ve sent a link."
          : "We’ll send a link if an account exists for that email."
      }
    >
      <form action={action} className="mt-6">
        <FieldLabel
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={state.error}
        />
        {link ? (
          <p className="mt-3">
            Development link:{" "}
            <a href={link} className="break-all text-[#0a84ff]">
              Open the reset link
            </a>
          </p>
        ) : null}
        <Submit />
      </form>
    </Door>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`mt-6 ${doorButton}`}>
      {pending ? "Please wait" : "Send a link"}
    </button>
  );
}
