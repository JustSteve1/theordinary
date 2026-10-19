export type TrendFlag =
  | "insufficient_baseline"
  | "within_range"
  | "above_range"
  | "below_range"
  | "review_suggested";

export type SessionRecord = {
  id: string;
  recordedAt: string;
  date: string;
  window: string;
  aborted: boolean;
  practice?: boolean;
  composite: number | null;
  coreRecall: number | null;
  detailRecall: number | null;
  intrusionRate: number | null;
  confounders: {
    poorSleep: boolean;
    unwellOrAlcohol: boolean;
  };
  trend: {
    nPrior: number;
    nPriorClean: number;
    baselineMean: number | null;
    baselineSd: number | null;
    z: number | null;
    flag: TrendFlag;
  };
};

export type MicStatus = "unknown" | "granted" | "denied" | "missing" | "skipped";

export type RecallSettings = {
  dayCapture: boolean;
  pausedUntil: string | null;
  micStatus: MicStatus;
  beeEnabled: boolean;
  reminderEnabled: boolean;
  reminderTime: string;
  reminderChannel: "email" | "notification";
};

export type RecallProfile = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  step: string;
  onboardedAt: string | null;
  consent: {
    termsVersion: string | null;
    termsAcceptedAt: string | null;
    privacyVersion: string | null;
    privacyAcceptedAt: string | null;
    healthVersion: string | null;
    healthAcceptedAt: string | null;
  };
  settings: RecallSettings;
};

export type HomeStateId =
  | "day1"
  | "ready"
  | "not_enough_data"
  | "no_source"
  | "mic_blocked"
  | "needs_consent";

export type Precheck = {
  eligible: boolean;
  reason: "ok" | "not_enough" | "none" | "quiet";
  source: "bee" | "day_capture" | "none";
};
