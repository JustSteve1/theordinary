"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { sendChat, type ChatState } from "@/app/app/chat/actions";

const initialState: ChatState = { error: "" };

export function ChatForm() {
  const [state, formAction] = useActionState(sendChat, initialState);

  return (
    <form action={formAction} className="mt-4">
      <label className="block">
        <span className="sr-only">Message</span>
        <textarea
          name="message"
          required
          maxLength={2000}
          rows={3}
          placeholder="Ask about this week"
          className="w-full resize-none rounded-md border border-white/15 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[#0a84ff]"
        />
      </label>
      {state.error ? (
        <p className="mt-3 text-[13px] text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 text-[#0a84ff] disabled:opacity-60"
    >
      {pending ? "Sending" : "Send"}
    </button>
  );
}
