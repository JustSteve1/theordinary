export type FactKind =
  | "place"
  | "event"
  | "meal"
  | "person"
  | "conversation"
  | "decision";

export type EntityType = "person" | "place" | "organization" | "unknown";

export type BeeFact = {
  factId: string;
  kind: FactKind;
  text: string;
  /** When set, these stems are used instead of building a key from text. */
  key?: string[];
  entities?: { name: string; type: EntityType }[];
  /** Calendar day the fact belongs to, for lure selection. */
  day?: string | null;
};

export type ProbeAnswer = "yes" | "no" | "dont_know";

export type ScoreProbe = {
  id: string;
  question: string;
  isLure: boolean;
  factId: string | null;
  answer?: ProbeAnswer;
};

export type CustomItem = {
  id: string;
  label: string;
  terms: string[];
};

export type ScoreInput = {
  checkinId?: string;
  recordedAt: string;
  targetDate: string | null;
  talkText: string;
  inputMode?: "voice" | "typed";
  asrConfidence?: number | null;
  probes?: ScoreProbe[];
  beeFacts: BeeFact[];
  historyFacts?: BeeFact[];
  customItems?: CustomItem[];
  priorNonEmpty?: number;
  timeZone?: string;
};

export type ClauseStatus = "internal" | "external" | "abstained";

export type Clause = {
  id: string;
  text: string;
  start: number;
  end: number;
  status: ClauseStatus;
  contentStems: string[];
};

export type FactMatch = {
  factId: string;
  kind: FactKind;
  score: number;
  status: "MATCH" | "PARTIAL" | "NOT_MENTIONED" | "ABSTAIN";
  clauseId: string | null;
  evidence: string | null;
  reason: string;
};

export type DimensionScore = {
  id: string;
  label: string;
  level: number;
  display: number;
  evidence: string | null;
  reason: string;
};

export type ScoreMetrics = {
  accuracy: number | null;
  richness: number | null;
  recall: number | null;
  core: number | null;
  detail: number | null;
  intrusion: number | null;
  recognitionHit: number | null;
  recognitionFalseAlarm: number | null;
  internalDetails: number;
  externalDetails: number;
  abstained: number;
  specificityRatio: number | null;
};

export type ScoreFlags = {
  emptyTalk: boolean;
  noBeeFacts: boolean;
  allAbstained: boolean;
  lowAsr: boolean;
  practice: boolean;
};

export type ScoreResult = {
  scorerVersion: string;
  configHash: string;
  matcherTier: "lexical" | "semantic";
  metrics: ScoreMetrics;
  dimensions: DimensionScore[];
  custom: { id: string; label: string; score: number }[];
  facts: FactMatch[];
  clauses: Clause[];
  flags: ScoreFlags;
  conditions: {
    lagDays: number | null;
    lagBand: string | null;
    practice: boolean;
  };
};
