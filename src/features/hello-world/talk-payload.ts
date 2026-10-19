export type TalkTurn = {
  id: string;
  question: string;
  answer: string;
};

export type ProbePrompt = {
  id: string;
  question: string;
};

export type ProbeReply = {
  id: string;
  answer: "yes" | "no" | "dont_know";
};

export type TalkPayload = {
  narrative: string;
  turns: TalkTurn[];
  durationMs: number;
  openerId: string | null;
  followUpId: string | null;
  poorSleep?: boolean;
  unwell?: boolean;
  draftId?: string;
  probeAnswers?: ProbeReply[];
};

export type FinishResult = {
  error?: string;
  saved?: boolean;
  draftId?: string;
  probes?: ProbePrompt[];
};
