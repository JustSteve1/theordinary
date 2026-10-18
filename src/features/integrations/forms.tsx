"use client";

import { useActionState, useState } from "react";

import {
  saveBeeToken,
  saveWhoopApp,
} from "@/src/features/integrations/actions";
import type { FormState } from "@/src/platform/recall/form";
import { FieldLabel } from "@/src/platform/shell/ui";

const initial: FormState = {};

export function BeeTokenForm() {
  const [state, action] = useActionState(saveBeeToken, initial);
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="mt-4 space-y-3">
      <FieldLabel
        label="Bee access token"
        name="token"
        type="password"
        autoComplete="off"
        value={token}
        onChange={setToken}
        showPassword={show}
        onTogglePassword={() => setShow((value) => !value)}
        error={state.error}
      />
      <button type="submit" className="text-[#0a84ff]">
        Save Bee token
      </button>
    </form>
  );
}

export function WhoopAppForm({ redirectUri }: { redirectUri: string }) {
  const [state, action] = useActionState(saveWhoopApp, initial);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="mt-4 space-y-3">
      <p className="text-[13px] leading-5 text-stone-400">
        In the WHOOP developer app, set the redirect URL to {redirectUri}
      </p>
      <FieldLabel
        label="WHOOP client id"
        name="client_id"
        autoComplete="off"
        value={clientId}
        onChange={setClientId}
      />
      <FieldLabel
        label="WHOOP client secret"
        name="client_secret"
        type="password"
        autoComplete="off"
        value={clientSecret}
        onChange={setClientSecret}
        showPassword={show}
        onTogglePassword={() => setShow((value) => !value)}
        error={state.error}
      />
      <button type="submit" className="text-[#0a84ff]">
        Save WHOOP app
      </button>
    </form>
  );
}
