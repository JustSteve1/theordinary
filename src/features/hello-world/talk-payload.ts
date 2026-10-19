export type TalkTurn = {
  id: string;
  question: string;
  answer: string;
};

export type TalkPayload = {
  narrative: string;
  turns: TalkTurn[];
  durationMs: number;
  openerId: string | null;
  followUpId: string | null;
  poorSleep?: boolean;
  unwell?: boolean;
};
