import type { SessionRecord } from "@/src/platform/recall/types";
import { cleanSessions, trendFor } from "@/src/platform/recall/trend";

const FORBIDDEN = new Set([
  "narrative",
  "transcript",
  "answer",
  "answers",
  "question",
  "questions",
  "terms",
  "term",
  "speech",
  "words",
  "summary",
  "fact",
  "facts",
  "todo",
  "todos",
  "email",
  "prompt",
  "utterance",
  "dialogue",
]);

/**
 * Log one episodic-recall session in process.
 * Same record as skills/episodic-recall/log_session.py: scores, confounders,
 * and the personal trend. Spoken words are refused. Vercel runs this path.
 */
export async function logSession(input: {
  id: string;
  recordedAt: string;
  date: string;
  window: string;
  aborted: boolean;
  composite: number | null;
  coreRecall: number | null;
  detailRecall: number | null;
  intrusionRate: number | null;
  confounders: SessionRecord["confounders"];
  prior: SessionRecord[];
}): Promise<SessionRecord> {
  refuseWords(input);
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) {
    throw new Error("Session record refused.");
  }
  if (!input.recordedAt.includes("T")) {
    throw new Error("Session record refused.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("Session record refused.");
  }
  if (!/^[a-z_]{1,32}$/.test(input.window)) {
    throw new Error("Session record refused.");
  }
  for (const value of [
    input.composite,
    input.coreRecall,
    input.detailRecall,
    input.intrusionRate,
  ]) {
    if (value !== null && !Number.isFinite(value)) {
      throw new Error("Session record refused.");
    }
  }

  const trend =
    input.aborted || input.composite === null
      ? blankTrend(input.prior)
      : trendFor(input.prior, input.composite);

  return {
    id: input.id,
    recordedAt: input.recordedAt,
    date: input.date,
    window: input.window,
    aborted: input.aborted,
    composite: input.composite,
    coreRecall: input.coreRecall,
    detailRecall: input.detailRecall,
    intrusionRate: input.intrusionRate,
    confounders: input.confounders,
    trend,
  };
}

function blankTrend(prior: SessionRecord[]): SessionRecord["trend"] {
  const completed = prior.filter(
    (session) => !session.aborted && session.composite !== null,
  );
  return {
    nPrior: completed.length,
    nPriorClean: cleanSessions(prior).length,
    baselineMean: null,
    baselineSd: null,
    z: null,
    flag: "insufficient_baseline",
  };
}

function refuseWords(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      refuseWords(item);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN.has(key.toLowerCase())) {
      throw new Error("Session record refused.");
    }
    refuseWords(item);
  }
}
