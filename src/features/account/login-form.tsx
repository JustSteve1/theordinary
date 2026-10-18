"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { doorButton } from "@/src/platform/shell/door";
import { FieldLabel } from "@/src/platform/shell/ui";
import { logIn, resendVerification } from "@/src/features/account/actions";
import type { FormState } from "@/src/platform/recall/form";

const initial: FormState = {};

export function LoginForm() {
  const [state, action] = useActionState(logIn, initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [resendNote, setResendNote] = useState("");

  async function resend() {
    const result = await resendVerification();
    setResendNote(result.error ?? "We've sent a new link.");
  }

  return (
    <form action={action}>
      <div className="mt-6 space-y-4">
          <FieldLabel
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
          />
          <FieldLabel
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            showPassword={show}
            onTogglePassword={() => setShow((current) => !current)}
          />
        </div>
      {state.error ? (
        <p className="mt-4 text-white" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.code === "unverified" ? (
        <button type="button" className="mt-3 text-[#0a84ff]" onClick={resend}>
          Resend link
        </button>
      ) : null}
      {resendNote ? <p className="mt-3 text-stone-400">{resendNote}</p> : null}
      <Submit />
      <p className="mt-4">
        <Link href="/login/forgot" className="text-[#0a84ff]">
          Forgot password
        </Link>
      </p>
      <p className="mt-4 text-stone-400">
        New here?{" "}
        <Link href="/signup" className="text-[#0a84ff]">
          Get started
        </Link>
      </p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`mt-6 ${doorButton}`}>
      {pending ? "Please wait" : "Continue"}
    </button>
  );
}
