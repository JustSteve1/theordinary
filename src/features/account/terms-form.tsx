"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/src/platform/shell/ui";
import { acceptTerms } from "@/src/features/account/actions";
import type { FormState } from "@/src/platform/recall/form";
import { copy } from "@/src/platform/recall/copy";

const initial: FormState = {};

export function TermsForm() {
  const [state, action] = useActionState(acceptTerms, initial);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  return (
    <form action={action} className="mt-6 space-y-4">
      <Check
        name="agree_terms"
        checked={terms}
        onChange={setTerms}
        label="I agree to the Terms"
        error={state.termsError}
      />
      <Check
        name="agree_privacy"
        checked={privacy}
        onChange={setPrivacy}
        label="I've read the Privacy policy"
        error={state.privacyError}
      />
      <p className="text-stone-400">{copy.healthNext}</p>
      {state.error ? (
        <p className="text-[#ffb4ab]" role="alert">
          {state.error}
        </p>
      ) : null}
      <Submit disabled={!terms || !privacy} />
    </form>
  );
}

function Check({
  name,
  checked,
  onChange,
  label,
  error,
}: {
  name: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <label className="flex min-h-12 items-start gap-3">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="mt-1 size-5"
      />
      <span>
        {label}
        {error ? (
          <span id={errorId} className="mt-1 block text-[#ffb4ab]" role="alert">
            {error}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} className="w-full">
      {pending ? "Creating account…" : "Continue"}
    </Button>
  );
}
