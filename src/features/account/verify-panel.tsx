"use client";

import { useActionState, useEffect, useState } from "react";

import { doorButton } from "@/src/platform/shell/door";
import { FieldLabel } from "@/src/platform/shell/ui";
import { changeSignupEmail, resendVerification } from "@/src/features/account/actions";
import type { FormState } from "@/src/platform/recall/form";

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
      <button
        type="button"
        disabled={pending || retry > 0}
        onClick={resend}
        className={doorButton}
      >
        {pending ? "Please wait" : retry > 0 ? `Resend in ${retry}s` : "Resend link"}
      </button>
      {error ? (
        <p className="text-white" role="alert">
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
        <button type="submit" className="text-[#0a84ff]">
          Change email
        </button>
      </form>
      <p>
        <a href="mailto:" className="text-[#0a84ff]">
          Open your email app
        </a>
      </p>
    </div>
  );
}
