"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { AuthState } from "@/lib/auth/actions";

const initialState: AuthState = { error: "" };

export function AuthForm({
  mode,
  action,
}: {
  mode: "signup" | "login";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const isSignup = mode === "signup";

  function update(name: "name" | "email" | "password", value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-[10px] border border-white/10 bg-white/[0.03] p-6"
      >
        <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          The Ordinary
        </p>
        <h1 className="mt-3 text-[22px] font-medium tracking-tight">
          {isSignup ? "Create your membership" : "Welcome back"}
        </h1>
        <p className="mt-2 text-[13px] leading-5 text-stone-400">
          {isSignup
            ? "Your week starts on the dashboard."
            : "Your dashboard is ready."}
        </p>

        <div className="mt-6 space-y-4">
          {isSignup ? (
            <Field
              label="Name"
              name="name"
              autoComplete="name"
              value={values.name}
              onChange={(value) => update("name", value)}
            />
          ) : null}
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(value) => update("email", value)}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={values.password}
            onChange={(value) => update("password", value)}
          />
        </div>

        {state.error ? (
          <p className="mt-4 text-[13px] text-red-400" role="alert">
            {state.error}
          </p>
        ) : null}

        <SubmitButton label={isSignup ? "Create membership" : "Continue"} />

        <p className="mt-4 text-[13px] text-stone-400">
          {isSignup ? (
            <>
              Already a member?{" "}
              <Link href="/login" className="text-[#0a84ff]">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/signup" className="text-[#0a84ff]">
                Get started
              </Link>
            </>
          )}
        </p>
      </form>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-left">
      <span className="text-[11px] text-stone-500">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[#0a84ff]"
      />
    </label>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full rounded-md bg-[#0a84ff] px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#0077ed] disabled:opacity-60"
    >
      {pending ? "Please wait" : label}
    </button>
  );
}
