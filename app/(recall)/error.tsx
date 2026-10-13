"use client";

import { Button } from "@/components/recall/ui";

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
