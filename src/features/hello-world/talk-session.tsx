"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ClientProbe } from "@/src/platform/recall/answer-key";
import { RecordingIndicator } from "@/src/platform/shell/recording-indicator";

type TalkPayload = {
  narrative: string;
  answers: { id: string; answer: string }[];
};

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function recognition(): SpeechRec | null {
  if (typeof window === "undefined") {
    return null;
  }
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  if (!Ctor) {
    return null;
  }
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-GB";
  return rec;
}

export function TalkSession({
  probes,
  finishTalk,
}: {
  probes: ClientProbe[];
  finishTalk: (payload: TalkPayload) => Promise<{ error?: string; saved?: boolean }>;
}) {
  const router = useRouter();
  const [holding, setHolding] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const holdingRef = useRef(false);
  const active = useRef<string | "narrative">("narrative");
  const interim = useRef("");
  const buckets = useRef<{ narrative: string; answers: Record<string, string> }>({
    narrative: "",
    answers: {},
  });
  const timers = useRef<number[]>([]);
  const recRef = useRef<SpeechRec | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const saving = useRef(false);

  function append(text: string) {
    const clean = text.trim();
    if (!clean) {
      return;
    }
    if (active.current === "narrative") {
      buckets.current.narrative = `${buckets.current.narrative} ${clean}`.trim();
      return;
    }
    const id = active.current;
    buckets.current.answers[id] = `${buckets.current.answers[id] ?? ""} ${clean}`.trim();
  }

  function commitInterim() {
    const text = interim.current.trim();
    interim.current = "";
    if (text) {
      append(text);
    }
  }

  function clearTimers() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }

  function later(ms: number, run: () => void) {
    const id = window.setTimeout(run, ms);
    timers.current.push(id);
  }

  function showProbe(index: number) {
    const probe = probes[index];
    if (!probe || !holdingRef.current) {
      return;
    }
    commitInterim();
    active.current = probe.id;
    setQuestion(probe.question);
    later(6000, () => {
      if (!holdingRef.current) {
        return;
      }
      commitInterim();
      active.current = "narrative";
      setQuestion(null);
      later(8000, () => showProbe(index + 1));
    });
  }

  function onSpeech(event: SpeechEvent) {
    let finalText = "";
    let pending = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result?.[0]?.transcript ?? "";
      if (result?.isFinal) {
        finalText += ` ${text}`;
      } else {
        pending += ` ${text}`;
      }
    }
    if (finalText.trim()) {
      append(finalText);
    }
    interim.current = pending.trim();
  }

  async function begin() {
    if (holdingRef.current || saving.current) {
      return;
    }
    setError(null);
    setStatus(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Recall can't use your microphone.");
      return;
    }

    buckets.current = { narrative: "", answers: {} };
    interim.current = "";
    active.current = "narrative";
    holdingRef.current = true;
    setHolding(true);
    setQuestion(null);

    const rec = recognition();
    recRef.current = rec;
    if (rec) {
      rec.onresult = onSpeech;
      rec.onerror = () => undefined;
      rec.onend = () => {
        if (holdingRef.current) {
          try {
            rec.start();
          } catch {
            /* The browser is already listening. */
          }
        }
      };
      try {
        rec.start();
      } catch {
        setError("This browser didn't start speech capture.");
      }
    } else {
      setError("This browser can't write down speech. Chrome can.");
    }

    if (probes.length > 0) {
      later(8000, () => showProbe(0));
    }
  }

  async function stop() {
    if (!holdingRef.current) {
      return;
    }
    holdingRef.current = false;
    setHolding(false);
    clearTimers();
    commitInterim();
    setQuestion(null);
    recRef.current?.stop();
    recRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const narrative = buckets.current.narrative.trim();
    const answers = probes.map((probe) => ({
      id: probe.id,
      answer: buckets.current.answers[probe.id] ?? "",
    }));
    if (!narrative && answers.every((item) => !item.answer)) {
      setError("Nothing was captured. Hold the button and talk about your day.");
      return;
    }

    saving.current = true;
    setStatus("Saving");
    const result = await finishTalk({ narrative, answers });
    saving.current = false;
    if (result.error) {
      setStatus(null);
      setError(result.error);
      return;
    }
    setStatus("Saved. The score is on the dashboard.");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center">
      <p className="max-w-sm text-center text-[13px] leading-5 text-stone-400">
        {probes.length === 0
          ? "Questions start once Bee has a day to draw from."
          : "A question may appear while you talk. Answer it in your own words."}
      </p>
      <div className="mt-6 flex min-h-16 items-center justify-center px-4 text-center">
        {question ? (
          <p className="max-w-sm text-balance text-[28px] font-medium leading-8 tracking-tight text-stone-100" aria-live="assertive">
            {question}
          </p>
        ) : holding ? (
          <RecordingIndicator label="Listening" interactive={false} />
        ) : null}
      </div>
      <button
        type="button"
        className={`mt-4 flex size-44 items-center justify-center rounded-full border text-[13px] text-stone-100 touch-none select-none ${
          holding ? "border-[#0a84ff]" : "border-white/15"
        }`}
        aria-pressed={holding}
        aria-label="Hold to talk about your day"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          void begin();
        }}
        onPointerUp={() => void stop()}
        onPointerCancel={() => void stop()}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            void begin();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            void stop();
          }
        }}
      >
        {holding ? "Release to finish" : "Hold to talk"}
      </button>
      <p className="mt-4 max-w-sm text-center text-[13px] leading-5 text-stone-400">
        Tell us about your day.
      </p>
      {status ? (
        <p className="mt-3 text-center text-[13px] text-stone-400" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 max-w-sm text-center text-[13px] text-[#ffb4ab]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
