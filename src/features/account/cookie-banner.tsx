"use client";

import { useEffect, useState } from "react";

import { Button } from "@/src/platform/shell/ui";

const STORAGE_KEY = "recall-cookie-choice";

export function CookieBanner() {
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);

  useEffect(() => {
    setChoice(window.localStorage.getItem(STORAGE_KEY));
    setReady(true);
  }, []);

  if (!ready || choice) {
    return null;
  }

  function choose(value: "essential" | "analytics") {
    window.localStorage.setItem(STORAGE_KEY, value);
    document.cookie = `recall_cookie=${value}; path=/; max-age=31536000; samesite=lax`;
    setChoice(value);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#1c1c1e] p-5">
      <p className="mx-auto max-w-xl">
        Recall uses essential cookies to keep you signed in. Analytics stay off
        until you allow them. Nothing is tracked before this choice.
      </p>
      <div className="mx-auto mt-4 flex max-w-xl flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={() => choose("essential")}>
          Essential only
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => choose("analytics")}
        >
          Allow analytics
        </Button>
      </div>
    </div>
  );
}
