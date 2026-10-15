"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ChatTurn } from "@/src/platform/recall/store";

export function ChatPanel({
  messages,
  suggestions,
  sendChat,
}: {
  messages: ChatTurn[];
  suggestions: string[];
  sendChat: (text: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(body: string) {
    const message = body.trim();
    if (!message || pending) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await sendChat(message);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setText("");
    router.refresh();
  }

  return (
    <div>
      <div className="space-y-4">
        {messages.length === 0 ? (
          <p className="text-[13px] leading-5 text-stone-400">
            Ask about a check-in question, a talk, Bee, or WHOOP.
          </p>
        ) : (
          messages.map((message) => (
            <p
              key={message.id}
              className={`text-[13px] leading-5 ${
                message.role === "assistant" ? "text-stone-100" : "text-stone-400"
              }`}
            >
              <span className="mb-1 block text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
                {message.role === "assistant" ? "Nova" : "You"}
              </span>
              {message.body}
            </p>
          ))
        )}
      </div>
      {suggestions.length > 0 ? (
        <div className="mt-6 flex flex-col items-start gap-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="text-left text-[#0a84ff] disabled:opacity-50"
              disabled={pending}
              onClick={() => void submit(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(text);
        }}
      >
        <label className="block text-stone-400" htmlFor="chat">
          Message
        </label>
        <textarea
          id="chat"
          name="chat"
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="mt-1 w-full rounded-[10px] border border-white/10 bg-transparent px-3 py-2 text-[13px] text-stone-100 outline-none"
        />
        <button
          type="submit"
          className="mt-3 text-[#0a84ff] disabled:opacity-50"
          disabled={pending || !text.trim()}
        >
          {pending ? "Asking…" : "Send"}
        </button>
      </form>
      {error ? (
        <p className="mt-3 text-[13px] text-[#ffb4ab]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
