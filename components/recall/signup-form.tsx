"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, FieldLabel, Panel } from "@/components/recall/ui";
import { saveSignupDraft, type FormState } from "@/lib/recall/actions";

const initial: FormState = {};

export function SignupForm() {
  const [state, action] = useActionState(saveSignupDraft, initial);
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState({ name: "", email: "", password: "" });

  function blur(name: "name" | "email" | "password") {
    const value = values[name];
    let error = "";
    if (name === "name" && value.trim().length < 1) {
      error = "Enter your first name.";
    }
    if (name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      error = "Enter a valid email.";
    }
    if (name === "password" && value.length < 8) {
      error = "Use at least 8 characters.";
    }
    setTouched((current) => ({ ...current, [name]: error }));
  }

  return (
    <form action={action}>
      <Panel>
        <h1 className="text-[28px] font-medium tracking-tight">
          Create your account
        </h1>
        <p className="mt-2 text-[#d6d3d1]">
          First name, email, and a password. You can leave whenever you want.
        </p>
        <div className="mt-6 space-y-4">
          <FieldLabel
            label="First name"
            name="name"
            autoComplete="given-name"
            value={values.name}
            onChange={(value) => setValues((current) => ({ ...current, name: value }))}
            onBlur={() => blur("name")}
            error={touched.name}
          />
          <FieldLabel
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(value) =>
              setValues((current) => ({ ...current, email: value }))
            }
            onBlur={() => blur("email")}
            error={touched.email}
          />
          <FieldLabel
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(value) =>
              setValues((current) => ({ ...current, password: value }))
            }
            onBlur={() => blur("password")}
            error={touched.password}
            showPassword={show}
            onTogglePassword={() => setShow((current) => !current)}
          />
        </div>
        {state.error ? (
          <p className="mt-4 text-[#ffb4ab]" role="alert">
            {state.error}{" "}
            {state.error.includes("already have an account") ? (
              <Link href="/login" className="text-[#0a84ff]">
                Log in
              </Link>
            ) : null}
          </p>
        ) : null}
        <Submit />
      </Panel>
      <p className="mt-4">
        Already have an account?{" "}
        <Link href="/login" className="text-[#0a84ff]">
          Log in
        </Link>
      </p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-6 w-full">
      {pending ? "Saving…" : "Continue"}
    </Button>
  );
}
