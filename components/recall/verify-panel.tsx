"use client";

import { useActionState, useEffect, useState } from "react";

import { Button, FieldLabel } from "@/components/recall/ui";
import {
  changeSignupEmail,
  resendVerification,
  type FormState,
} from "@/lib/recall/actions";

export function VerifyPanel({
  initialRetry,
  devLink,
}: {
  initialRetry: number;
  devLink?: string;
}) {
  const [retry, setRetry] = useState(initialRetry);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [changeState, changeAction] = useActionState(
    changeSignupEmail,
    {} as FormState,
  );

  useEffect(() => {
    if (retry <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setRetry((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retry]);

  useEffect(() => {
    if (changeState.retryIn) {
      setRetry(changeState.retryIn);
    }
  }, [changeState.retryIn]);

  async function resend() {
    setPending(true);
    setError("");
    const result = await resendVerification();
    setPending(false);
    if (result.error) {
      setError(result.error);
    }
    if (result.retryIn) {
      setRetry(result.retryIn);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <Button type="button" disabled={pending || retry > 0} onClick={resend}>
        {pending ? "Sending…" : retry > 0 ? `Resend in ${retry}s` : "Resend link"}
      </Button>
      {error ? (
        <p className="text-[#ffb4ab]" role="alert">
          {error}
        </p>
      ) : null}
      {devLink ? (
        <p>
          Development link:{" "}
          <a href={devLink} className="break-all text-[#0a84ff]">
            Open the verification link
          </a>
        </p>
      ) : null}
      <form action={changeAction} className="space-y-3">
        <FieldLabel
          label="New email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={changeState.error}
        />
        <Button type="submit" variant="secondary">
          Change email
        </Button>
      </form>
      <p>
        <a href="mailto:" className="inline-flex min-h-12 items-center text-[#0a84ff]">
          Open your email app
        </a>
      </p>
    </div>
  );
}
