"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, FieldLabel, Panel } from "@/src/platform/shell/ui";
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
      <Panel>
        <h1 className="text-[28px] font-medium tracking-tight">Log in</h1>
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
          <p className="mt-4 text-[#ffb4ab]" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.code === "unverified" ? (
          <Button type="button" variant="secondary" className="mt-3" onClick={resend}>
            Resend link
          </Button>
        ) : null}
        {resendNote ? <p className="mt-3">{resendNote}</p> : null}
        <Submit />
        <p className="mt-4">
          <Link href="/login/forgot" className="text-[#0a84ff]">
            Forgot password
          </Link>
        </p>
      </Panel>
      <p className="mt-4">
        New here?{" "}
        <Link href="/signup" className="text-[#0a84ff]">
          Sign up
        </Link>
      </p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-6 w-full">
      {pending ? "Signing in…" : "Log in"}
    </Button>
  );
}
