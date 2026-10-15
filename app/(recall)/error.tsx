"use client";

import { Button } from "@/src/platform/shell/ui";

export default function RecallError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <p>Couldn’t load this page.</p>
      <Button type="button" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
