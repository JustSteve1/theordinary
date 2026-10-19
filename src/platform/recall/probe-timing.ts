export const TALK_MS = 180_000;

export type ProbeLine = {
  id: string;
  text: string;
};

export type ProbeWindow = "morning" | "afternoon" | "evening";

export type TalkScript = {
  window: ProbeWindow;
  opener: ProbeLine;
  followUpId: string;
  followUps: [ProbeLine, ProbeLine];
  handling: {
    silence: ProbeLine;
    cantRemember: ProbeLine;
    nothing: ProbeLine;
    hint: ProbeLine;
  };
};

export type FollowReplacement = {
  slot: 1 | 2;
  id: string;
  text: string;
};

const OPENER_AT = 45_000;
const LINE_MS = 30_000;
const GAP_MS = 15_000;
const FOLLOW_1_AT = OPENER_AT + LINE_MS + GAP_MS;
const FOLLOW_2_AT = FOLLOW_1_AT + LINE_MS + GAP_MS;

/** The line on screen for this much time into the recording, or nothing. */
export function lineAt(
  elapsedMs: number,
  script: TalkScript,
  replacement: FollowReplacement | null,
): ProbeLine | null {
  if (elapsedMs >= TALK_MS) {
    return null;
  }
  if (elapsedMs >= OPENER_AT && elapsedMs < OPENER_AT + LINE_MS) {
    return script.opener;
  }
  if (elapsedMs >= FOLLOW_1_AT && elapsedMs < FOLLOW_1_AT + LINE_MS) {
    if (replacement?.slot === 1) {
      return { id: replacement.id, text: replacement.text };
    }
    return script.followUps[0];
  }
  if (elapsedMs >= FOLLOW_2_AT && elapsedMs < FOLLOW_2_AT + LINE_MS) {
    if (replacement?.slot === 2) {
      return { id: replacement.id, text: replacement.text };
    }
    return script.followUps[1];
  }
  return null;
}

/** The follow-up that has not started yet. Nothing new is due after 3:00. */
export function nextFollowSlot(elapsedMs: number): 1 | 2 | null {
  if (elapsedMs >= TALK_MS) {
    return null;
  }
  if (elapsedMs < FOLLOW_1_AT) {
    return 1;
  }
  if (elapsedMs < FOLLOW_2_AT) {
    return 2;
  }
  return null;
}

export type HandlingKind = "cantRemember" | "nothing" | "hint";

/** Phrases from the bank that stand in for the next follow-up. */
export function handlingMatch(text: string): HandlingKind | null {
  const value = text.toLowerCase();
  if (/\bhint\b|remind me|give me a clue|what was it again/.test(value)) {
    return "hint";
  }
  if (
    /can'?t remember|cannot remember|don'?t remember|do not remember|i forgot/.test(
      value,
    )
  ) {
    return "cantRemember";
  }
  if (/nothing happened|quiet day|nothing much happened|not much happened/.test(value)) {
    return "nothing";
  }
  return null;
}

export function silenceDue(elapsedMs: number, lastSpeechMs: number | null) {
  if (elapsedMs < OPENER_AT) {
    return false;
  }
  const anchor = Math.max(lastSpeechMs ?? OPENER_AT, OPENER_AT);
  return elapsedMs - anchor >= 8_000;
}

export function talkButtonLabel(elapsedMs: number) {
  if (elapsedMs >= TALK_MS) {
    const over = Math.floor((elapsedMs - TALK_MS) / 1000);
    const minutes = Math.floor(over / 60);
    const seconds = over % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")} over`;
  }
  const left = Math.ceil((TALK_MS - elapsedMs) / 1000);
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDuration(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) {
    return null;
  }
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
