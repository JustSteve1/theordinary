export type NudgeDecision = "send" | "hold";
export type NudgeStatus = "held" | "pending" | "shown" | "dismissed" | "expired";

export type NudgeDraft = {
  userId: string;
  ruleId: string;
  ruleVersion: number;
  kind: string;
  category: string;
  trigger: string;
  triggerKey: string;
  decision: NudgeDecision;
  probability: number;
  randU: number;
  messageKey: string;
  params: Record<string, number>;
  priority: number;
  createdAt: Date;
  expiresAt: Date;
  status: "pending" | "held";
  channel: string;
};

export type NudgeRow = Omit<NudgeDraft, "status"> & {
  id: string;
  status: NudgeStatus;
  shownAt: Date | null;
  dismissedAt: Date | null;
  helpful: boolean | null;
};

export type SendSlot = {
  category: string;
  createdAt: Date;
};

export type NudgeStore = {
  insert(draft: NudgeDraft): Promise<"inserted" | "duplicate">;
  listActive(userId: string, now: Date, limit: number): Promise<NudgeRow[]>;
  history(userId: string, since: Date): Promise<NudgeRow[]>;
  markShown(userId: string, nudgeId: string, now: Date): Promise<boolean>;
  dismiss(userId: string, nudgeId: string, helpful: boolean | null, now: Date): Promise<boolean>;
  expireOld(userId: string, now: Date): Promise<number>;
  readEnabled(userId: string): Promise<boolean>;
  writeEnabled(userId: string, enabled: boolean): Promise<void>;
  hasHealthConsent(userId: string): Promise<boolean>;
  lastFiredAt(userId: string, ruleId: string): Promise<Date | null>;
  sendsBetween(userId: string, start: Date, end: Date): Promise<SendSlot[]>;
  consentedEnabledMembers(): Promise<string[]>;
};
