"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Button, ButtonLink, Panel } from "@/src/platform/shell/ui";
import { completeCheckin } from "@/src/features/check-in/actions";
import type { FormState } from "@/src/platform/recall/form";
import { copy } from "@/src/platform/recall/copy";
import { recallDefaults } from "@/src/platform/recall/defaults";
import {
  checkInScript,
  type MockScenario,
  type SkillEvent,
} from "@/src/features/check-in/script";

export function VoiceSession({ scenario }: { scenario: MockScenario }) {
  const script = useMemo(() => checkInScript(scenario), [scenario]);
  const [index, setIndex] = useState(0);
  const [confirmStop, setConfirmStop] = useState(false);
  const [reassurance, setReassurance] = useState(false);
  const [poorSleep, setPoorSleep] = useState(false);
  const [unwell, setUnwell] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState("");
  const [saveState, saveAction] = useActionState(completeCheckin, {} as FormState);
  const formRef = useRef<HTMLFormElement>(null);
  const saved = useRef(false);
  const event = script[index];

  useEffect(() => {
    if (script[index]?.type !== "skill.preparing") {
      return;
    }
    const reassure = window.setTimeout(
      () => setReassurance(true),
      recallDefaults.preparingReassuranceMs,
    );
    const delay =
      scenario === "slow" ? recallDefaults.preparingReassuranceMs + 1000 : 1200;
    const advance = window.setTimeout(
      () => setIndex((current) => current + 1),
      delay,
    );
    return () => {
      window.clearTimeout(reassure);
      window.clearTimeout(advance);
    };
  }, [index, scenario, script]);

  useEffect(() => {
    if (script[index]?.type !== "skill.saving" || saved.current) {
      return;
    }
    saved.current = true;
    formRef.current?.requestSubmit();
  }, [index, script]);

  useEffect(() => {
    if (saveState.error) {
      setError(saveState.error);
    }
  }, [saveState.error]);

  function advance() {
    setIndex((current) => current + 1);
  }

  function answer(yes: boolean) {
    if (event?.type !== "agent.say") {
      return;
    }
    if (event.prompt === "consent" && !yes) {
      setDeclined(true);
      return;
    }
    if (event.prompt === "sleep") {
      setPoorSleep(yes);
    }
    if (event.prompt === "unwell") {
      setUnwell(yes);
    }
    advance();
  }

  const visual = visualFor(event, declined, error);

  return (
    <div className="space-y-4">
      <Panel>
        <div
          className={`mx-auto flex size-36 items-center justify-center rounded-full border border-white/15 ${
            visual.pulse ? "motion-safe:animate-pulse" : ""
          }`}
          aria-hidden
        >
          <span className="text-center text-[13px] text-stone-400">{visual.label}</span>
        </div>
        <p className="mt-6" aria-live="polite">
          {declined ? copy.declined : error || visual.caption}
        </p>
        {event?.type === "skill.preparing" && reassurance ? (
          <p>Still getting ready, nearly there.</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3">
          {declined ? (
            <ButtonLink href="/home?notice=declined">Back to home</ButtonLink>
          ) : null}
          {event?.type === "agent.say" &&
          !declined &&
          event.prompt !== "speak" ? (
            <>
              <Button type="button" onClick={() => answer(true)}>
                Yes
              </Button>
              <Button type="button" variant="secondary" onClick={() => answer(false)}>
                No
              </Button>
            </>
          ) : null}
          {event?.type === "agent.say" && event.prompt === "speak" && !declined ? (
            <Button type="button" onClick={advance}>
              I’m ready to talk
            </Button>
          ) : null}
          {event?.type === "agent.listen" ? (
            <Button type="button" onClick={advance}>
              I’ve finished
            </Button>
          ) : null}
          {event?.type === "skill.error" ? (
            <ButtonLink href="/checkin" variant="secondary">
              Try again
            </ButtonLink>
          ) : null}
          {event?.type === "skill.aborted" && event.reason === "distress" ? (
            <ButtonLink href="/home?notice=distress">Back to home</ButtonLink>
          ) : null}
          {error ? (
            <ButtonLink href="/checkin" variant="secondary">
              Try again
            </ButtonLink>
          ) : null}
        </div>
      </Panel>
      <form ref={formRef} action={saveAction} hidden>
        <input type="hidden" name="poor_sleep" value={poorSleep ? "on" : ""} />
        <input type="hidden" name="unwell" value={unwell ? "on" : ""} />
      </form>
      <Button type="button" variant="secondary" onClick={() => setConfirmStop(true)}>
        Stop
      </Button>
      {confirmStop ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stop-title"
          className="rounded-[10px] border border-white/10 bg-[#1c1c1e] p-5"
        >
          <h2 id="stop-title" className="text-[13px] font-medium text-stone-100">
            End this check-in?
          </h2>
          <p className="mt-2">Nothing from today’s check-in will be saved.</p>
          <div className="mt-4 flex flex-col gap-3">
            <ButtonLink href="/home?notice=ended">End check-in</ButtonLink>
            <Button type="button" variant="secondary" onClick={() => setConfirmStop(false)}>
              Keep going
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function visualFor(event: SkillEvent | undefined, declined: boolean, error: string) {
  if (declined) {
    return { label: "Ended", caption: copy.declined, pulse: false };
  }
  if (error) {
    return { label: "Stopped", caption: error, pulse: false };
  }
  if (!event || event.type === "skill.preparing") {
    return {
      label: "Getting ready",
      caption: "Getting ready…",
      pulse: true,
    };
  }
  if (event.type === "agent.say") {
    return { label: "Speaking", caption: event.text, pulse: false };
  }
  if (event.type === "agent.listen") {
    return { label: "Listening", caption: "I’m listening", pulse: true };
  }
  if (event.type === "skill.saving") {
    return { label: "Saving", caption: copy.saving, pulse: true };
  }
  if (event.type === "skill.aborted") {
    return {
      label: "Ended",
      caption: event.reason === "distress" ? copy.distress : copy.stopped,
      pulse: false,
    };
  }
  if (event.type === "skill.error") {
    const caption =
      event.code === "connection"
        ? "We lost the connection. Nothing was saved."
        : event.code === "mic"
          ? "The microphone stopped. Check it is allowed for this site, then try again. Nothing was saved."
          : "Something went wrong on our side. Nothing was saved.";
    return { label: "Stopped", caption, pulse: false };
  }
  return { label: "Check-in", caption: "", pulse: false };
}
