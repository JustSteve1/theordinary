"use client";

import { useState } from "react";

export function RecordingIndicator({
  label,
  interactive,
  pauseCapture,
  turnOffCapture,
}: {
  label: "Listening" | "Day capture on";
  interactive: boolean;
  pauseCapture?: () => Promise<void>;
  turnOffCapture?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {interactive ? (
        <button
          type="button"
          className="inline-flex items-center gap-2 text-[13px] text-stone-400"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Marker />
          {label}
        </button>
      ) : (
        <p className="inline-flex items-center gap-2 text-[13px] text-stone-400">
          <Marker />
          {label}
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
      {open && interactive && pauseCapture && turnOffCapture ? (
        <div className="absolute right-0 z-10 mt-1 w-64 rounded-[10px] border border-white/10 bg-[#1c1c1e] p-3">
          <form action={pauseCapture}>
            <button type="submit" className="block py-2 text-left text-[#0a84ff]">
              Pause for 1 hour
            </button>
          </form>
          <form action={turnOffCapture}>
            <button type="submit" className="block py-2 text-left text-[#0a84ff]">
              Turn off
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Marker() {
  return (
    <span
      className="inline-block size-2.5 rounded-full bg-[#ff9f0a] motion-safe:animate-pulse"
      aria-hidden
    />
  );
}
