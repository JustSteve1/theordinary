"use client";

import { useState } from "react";

import { Button } from "@/src/platform/shell/ui";

export function RevealList({
  items,
}: {
  items: { type: string; text: string }[];
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) {
    return null;
  }
  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Want to see what else was captured?
      </Button>
    );
  }
  return (
    <ul className="list-disc space-y-2 pl-6">
      {items.map((item) => (
        <li key={item.text}>{item.text}</li>
      ))}
    </ul>
  );
}
