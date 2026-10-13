"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useFormStatus } from "react-dom";

import { Button, FieldLabel, Panel, RecallFrame } from "@/components/recall/ui";
import { requestPasswordReset, type FormState } from "@/lib/recall/actions";

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
    <RecallFrame>
      <form action={action}>
        <Panel>
          <h1 className="text-[28px] font-medium tracking-tight">Reset your password</h1>
          {sent ? (
            <p className="mt-3">
              If an account exists for that email, we’ve sent a link.
            </p>
          ) : (
            <p className="mt-3">We’ll send a link if an account exists for that email.</p>
          )}
          <div className="mt-4">
            <FieldLabel
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={setEmail}
              error={state.error}
            />
          </div>
          {link ? (
            <p className="mt-3">
              Development link:{" "}
              <a href={link} className="break-all text-[#0a84ff]">
                Open the reset link
              </a>
            </p>
          ) : null}
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
      {pending ? "Sending…" : "Send a link"}
    </Button>
  );
}
