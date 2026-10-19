"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { TalkPayload } from "@/src/features/hello-world/talk-payload";
import { copy } from "@/src/platform/recall/copy";
import {
  handlingMatch,
  lineAt,
  nextFollowSlot,
  silenceDue,
  talkButtonLabel,
  type FollowReplacement,
  type ProbeLine,
  type TalkScript,
} from "@/src/platform/recall/probe-timing";

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function emptyReason(problem: string | null) {
  if (problem === "unsupported") {
    return "This browser can't write down speech. Use Safari on iPhone, or Chrome on a computer.";
  }
  if (problem === "not-allowed" || problem === "service-not-allowed") {
    return "Allow the microphone for this site, then tap to talk again.";
  }
  if (problem === "audio-capture") {
    return "Recall can't use your microphone.";
  }
  if (problem === "start") {
    return "This browser didn't start speech capture.";
  }
  return "Nothing was captured. Tap the button and talk about your day.";
}

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
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  rec.continuous = !ios;
  rec.interimResults = true;
  rec.lang = "en-GB";
  return rec;
}

export function TalkSession({
  script,
  finishTalk,
}: {
  script: TalkScript;
  finishTalk: (payload: TalkPayload) => Promise<{ error?: string; saved?: boolean }>;
}) {
  const router = useRouter();
  const [holding, setHolding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cue, setCue] = useState<ProbeLine | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [poorSleep, setPoorSleep] = useState(false);
  const [unwell, setUnwell] = useState(false);
  const holdingRef = useRef(false);
  const interim = useRef("");
  const narrativeRef = useRef("");
  const turnsRef = useRef<TalkPayload["turns"]>([]);
  const cueRef = useRef<ProbeLine | null>(null);
  const replacementRef = useRef<FollowReplacement | null>(null);
  const lastSpeechAt = useRef<number | null>(null);
  const scriptRef = useRef(script);
  const recRef = useRef<SpeechRec | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const saving = useRef(false);
  const speechProblem = useRef<string | null>(null);
  const endWait = useRef<(() => void) | null>(null);
  const startedAt = useRef(0);
  const tickRef = useRef<() => void>(() => {});
  scriptRef.current = script;

  function elapsedNow() {
    return performance.now() - startedAt.current;
  }

  function noteHandling(elapsedMs: number) {
    if (replacementRef.current) {
      return;
    }
    const kind = handlingMatch(narrativeRef.current);
    const slot = kind ? nextFollowSlot(elapsedMs) : null;
    if (!kind || !slot) {
      return;
    }
    const line = scriptRef.current.handling[kind];
    replacementRef.current = { slot, id: line.id, text: line.text };
  }

  function append(text: string) {
    const clean = text.trim();
    if (!clean) {
      return;
    }
    narrativeRef.current = `${narrativeRef.current} ${clean}`.trim();
    const current = cueRef.current;
    if (current) {
      const turn = turnsRef.current.find((item) => item.id === current.id);
      if (turn) {
        turn.answer = `${turn.answer} ${clean}`.trim();
      } else {
        turnsRef.current.push({
          id: current.id,
          question: current.text,
          answer: clean,
        });
      }
    }
    const elapsedMs = elapsedNow();
    lastSpeechAt.current = elapsedMs;
    noteHandling(elapsedMs);
  }

  function commitInterim() {
    const text = interim.current.trim();
    interim.current = "";
    if (text) {
      append(text);
    }
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

  function begin() {
    if (holdingRef.current || saving.current) {
      return;
    }
    setError(null);
    setStatus(null);
    speechProblem.current = null;
    narrativeRef.current = "";
    turnsRef.current = [];
    interim.current = "";
    cueRef.current = null;
    replacementRef.current = null;
    lastSpeechAt.current = null;
    setCue(null);
    setElapsed(0);
    holdingRef.current = true;
    startedAt.current = performance.now();

    const rec = recognition();
    recRef.current = rec;
    if (rec) {
      rec.onresult = onSpeech;
      rec.onerror = (event) => {
        const code = event.error ?? "";
        if (code === "aborted" || code === "no-speech") {
          return;
        }
        speechProblem.current = code;
      };
      rec.onend = () => {
        if (
          holdingRef.current &&
          speechProblem.current !== "not-allowed" &&
          speechProblem.current !== "service-not-allowed" &&
          speechProblem.current !== "audio-capture"
        ) {
          try {
            rec.start();
          } catch {
            /* The browser is already listening. */
          }
          return;
        }
        endWait.current?.();
      };
      try {
        rec.start();
      } catch {
        speechProblem.current = "start";
      }
    } else {
      speechProblem.current = "unsupported";
      void openMicrophone();
    }
    setHolding(true);
  }

  /**
   * Speech-to-text opens the microphone itself. A second audio stream on
   * iPhone cuts that off, so the plain stream is only used when speech-to-text
   * is unavailable.
   */
  async function openMicrophone() {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      speechProblem.current = "audio-capture";
    }
  }

  tickRef.current = () => {
    const elapsedMs = elapsedNow();
    setElapsed(elapsedMs);
    if (!replacementRef.current && silenceDue(elapsedMs, lastSpeechAt.current)) {
      const slot = nextFollowSlot(elapsedMs);
      if (slot) {
        const line = scriptRef.current.handling.silence;
        replacementRef.current = { slot, id: line.id, text: line.text };
      }
    }
    const next = lineAt(elapsedMs, scriptRef.current, replacementRef.current);
    if (cueRef.current?.id !== next?.id) {
      commitInterim();
    }
    cueRef.current = next;
    setCue((current) =>
      current?.id === next?.id && current?.text === next?.text ? current : next,
    );
  };

  useEffect(() => {
    if (!holding) {
      return;
    }
    const id = window.setInterval(() => tickRef.current(), 200);
    return () => window.clearInterval(id);
  }, [holding]);

  async function stop() {
    if (!holdingRef.current || saving.current) {
      return;
    }
    saving.current = true;
    holdingRef.current = false;
    setHolding(false);
    setStatus("Saving");
    const durationMs = Math.round(elapsedNow());
    const rec = recRef.current;
    if (rec) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 1500);
        endWait.current = () => {
          window.clearTimeout(timer);
          resolve();
        };
        try {
          rec.stop();
        } catch {
          resolve();
        }
      });
      endWait.current = null;
    }
    commitInterim();
    recRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    cueRef.current = null;
    setCue(null);

    const narrative = narrativeRef.current.trim();
    const turns = turnsRef.current.map((turn) => ({ ...turn }));
    if (!narrative && turns.every((turn) => !turn.answer)) {
      saving.current = false;
      setStatus(null);
      setError(emptyReason(speechProblem.current));
      return;
    }

    const result = await finishTalk({
      narrative,
      turns,
      durationMs,
      openerId: script.opener.id,
      followUpId: script.followUpId,
      poorSleep,
      unwell,
    });
    saving.current = false;
    if (result.error) {
      setStatus(null);
      setError(result.error);
      return;
    }
    setStatus("Saved. The score is on the dashboard.");
    router.refresh();
  }

  function onTap() {
    if (saving.current || status === "Saving") {
      return;
    }
    if (holdingRef.current) {
      void stop();
      return;
    }
    begin();
  }

  const label = holding ? talkButtonLabel(elapsed) : "Tap to talk";

  return (
    <div className="flex w-full flex-col items-center">
      <p className="max-w-sm text-center leading-6 text-stone-400">
        A question may appear while you talk. Answer it in your own words.
      </p>
      <div className="mt-4 flex w-full flex-col gap-3 text-left text-stone-300">
        <label className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            checked={poorSleep}
            onChange={(event) => setPoorSleep(event.target.checked)}
          />
          {copy.sleepQuestion}
        </label>
        <label className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            checked={unwell}
            onChange={(event) => setUnwell(event.target.checked)}
          />
          {copy.unwellQuestion}
        </label>
      </div>
      <div className="mt-4 flex min-h-12 w-full items-center justify-center px-1 text-center">
        {holding && cue ? (
          <p
            className="max-w-sm text-balance text-[22px] font-medium leading-7 tracking-tight text-stone-100"
            aria-live="assertive"
          >
            {cue.text}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className={`mt-4 flex size-48 items-center justify-center rounded-full border px-4 text-center text-[22px] font-medium leading-tight tabular-nums text-stone-100 touch-none select-none [-webkit-touch-callout:none] ${
          holding ? "border-[#0a84ff]" : "border-white/15"
        }`}
        aria-pressed={holding}
        aria-label={holding ? `${label}. Tap to finish talking` : "Tap to talk about your day"}
        disabled={status === "Saving"}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          onTap();
        }}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            onTap();
          }
        }}
      >
        {label}
      </button>
      <p className="mt-4 max-w-sm text-center leading-6 text-stone-400">
        Tell us about your day.
      </p>
      {status ? (
        <p className="mt-3 text-center text-stone-400" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 max-w-sm text-center text-[#ffb4ab]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
