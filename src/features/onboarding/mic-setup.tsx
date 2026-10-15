"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Panel } from "@/src/platform/shell/ui";
import { saveMicrophone } from "@/src/features/onboarding/actions";
import type { FormState } from "@/src/platform/recall/form";
import { copy } from "@/src/platform/recall/copy";
import { recallDefaults } from "@/src/platform/recall/defaults";

const initial: FormState = {};

export function MicSetup() {
  const [state, action] = useActionState(saveMicrophone, initial);
  const [status, setStatus] = useState<
    "unknown" | "granted" | "denied" | "missing" | "skipped"
  >("unknown");
  const [level, setLevel] = useState(0);
  const [dayCapture, setDayCapture] = useState<boolean>(
    recallDefaults.dayCaptureDefault,
  );
  const [sampleOpen, setSampleOpen] = useState(false);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function allow() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("missing");
      return;
    }
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = next;
      setStatus("granted");
      const audio = new AudioContext();
      const source = audio.createMediaStreamSource(next);
      const analyser = audio.createAnalyser();
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        const peak = Math.max(...data) / 128 - 1;
        setLevel(Math.min(1, Math.abs(peak) * 4));
        if (stream.current) {
          window.requestAnimationFrame(tick);
        }
      };
      tick();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStatus(name === "NotFoundError" ? "missing" : "denied");
    }
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mic_status" value={status} />
      <Panel>
        <h2 className="text-[22px] font-medium">Voice check-ins</h2>
        <p className="mt-2 text-[#d6d3d1]">
          Check-ins use the microphone. Your browser will ask before it turns
          the mic on.
        </p>
        <Button type="button" className="mt-4" onClick={allow}>
          Allow microphone
        </Button>
        {status === "granted" ? (
          <p className="mt-3">
            Microphone on. Say hello so we can hear you.
            <span
              className="mt-2 block h-2 rounded-full bg-white/10"
              aria-hidden
            >
              <span
                className="block h-2 rounded-full bg-[#0a84ff]"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </span>
          </p>
        ) : null}
        {status === "denied" || status === "missing" ? (
          <div className="mt-3 text-[#d6d3d1]">
            <p>
              {status === "missing"
                ? "No microphone was found."
                : "The browser blocked the microphone."}
            </p>
            <p className="mt-2">
              Allow the microphone for this site in the browser’s site settings,
              then come back. You can also skip for now.
            </p>
          </div>
        ) : null}
        <Button
          type="button"
          variant="quiet"
          className="mt-2"
          onClick={() => setStatus("skipped")}
        >
          Skip for now
        </Button>
        {status === "skipped" ? <p className="mt-2">Skipped for now.</p> : null}
      </Panel>
      <Panel>
        <h2 className="text-[22px] font-medium">Day capture</h2>
        <p className="mt-2 text-[#d6d3d1]">
          Recall can listen during the day so tomorrow’s check-in has something
          to compare with. You’ll always see an indicator while it’s on, and you
          can pause it any time.
        </p>
        <p className="mt-2 text-[#d6d3d1]">
          Other people’s words are only used to build your check-in and are
          never kept.
        </p>
        <label className="mt-4 flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            name="day_capture"
            checked={dayCapture}
            onChange={(event) => setDayCapture(event.target.checked)}
            className="size-5"
          />
          Turn on day capture
        </label>
      </Panel>
      {recallDefaults.samplePromptOnMicStep ? (
        <div>
          <button
            type="button"
            className="min-h-12 text-[#0a84ff]"
            aria-expanded={sampleOpen}
            onClick={() => setSampleOpen((current) => !current)}
          >
            What will it ask me?
          </button>
          {sampleOpen ? <p className="mt-2">{copy.sampleAsk}</p> : null}
        </div>
      ) : null}
      {state.error ? (
        <p className="text-[#ffb4ab]" role="alert">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : "Continue"}
    </Button>
  );
}
