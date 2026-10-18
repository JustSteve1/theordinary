import type { BeeSnapshot } from "@/src/platform/integrations/bee";
import { dateKey } from "@/src/platform/recall/dates";
import type { SessionRecord } from "@/src/platform/recall/types";
import { cleanSessions, trendFor } from "@/src/platform/recall/trend";

export type FactKind = "place" | "meal" | "event";

/** Server-only. `terms` is the hidden fact and must never be sent to the browser. */
export type AnswerFact = {
  id: string;
  kind: FactKind;
  question: string;
  terms: string[];
};

export type ClientProbe = {
  id: string;
  question: string;
};

export type TalkAnswer = {
  id: string;
  question: string;
  answer: string;
};

const STOP = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "been",
  "but",
  "did",
  "for",
  "from",
  "had",
  "has",
  "have",
  "her",
  "him",
  "his",
  "into",
  "just",
  "last",
  "like",
  "night",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "was",
  "were",
  "what",
  "when",
  "where",
  "with",
  "you",
  "your",
]);

export function keywords(text: string) {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length < 4 || STOP.has(word) || seen.has(word)) {
      continue;
    }
    seen.add(word);
    words.push(word);
    if (words.length === 8) {
      break;
    }
  }
  return words;
}

function hourInZone(time: number, timeZone: string) {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(new Date(time))
      .find((part) => part.type === "hour")?.value;
    return Number(hour ?? "12");
  } catch {
    return new Date(time).getUTCHours();
  }
}

function remembered(terms: string[], text: string) {
  const words = new Set(keywords(text));
  return terms.some((term) => words.has(term));
}

/**
 * Turns Bee summaries, and the member's own earlier narrative, into questions.
 * The question text never contains the fact it is scoring.
 */
export function buildAnswerKey(input: {
  bee: BeeSnapshot;
  narratives: { id: string; narrative: string }[];
  now?: number;
}): AnswerFact[] {
  const now = input.now ?? Date.now();
  const facts: AnswerFact[] = [];

  if (input.bee.status === "ok") {
    for (const conversation of input.bee.conversations) {
      const terms = keywords(conversation.summary);
      if (terms.length === 0) {
        continue;
      }
      const ageDays = (now - conversation.startMs) / 86_400_000;
      const hour = hourInZone(conversation.startMs, input.bee.timezone);
      if (ageDays >= 6 && ageDays < 9 && !facts.some((fact) => fact.kind === "place")) {
        facts.push({
          id: `bee-place-${conversation.startMs}`,
          kind: "place",
          question: "Where were you this time last week?",
          terms,
        });
      } else if (
        ageDays >= 0.4 &&
        ageDays < 1.6 &&
        hour >= 17 &&
        !facts.some((fact) => fact.kind === "meal")
      ) {
        facts.push({
          id: `bee-meal-${conversation.startMs}`,
          kind: "meal",
          question: "What did you eat for dinner last night?",
          terms,
        });
      } else if (ageDays < 2 && !facts.some((fact) => fact.kind === "event")) {
        facts.push({
          id: `bee-event-${conversation.startMs}`,
          kind: "event",
          question: "What were you doing around this time yesterday?",
          terms,
        });
      }
    }
  }

  const prior = input.narratives.at(-1);
  if (prior && !facts.some((fact) => fact.kind === "event")) {
    const terms = keywords(prior.narrative);
    if (terms.length > 0) {
      facts.push({
        id: `prior-${prior.id}`,
        kind: "event",
        question: "What do you remember from the last time you told us about your day?",
        terms,
      });
    }
  }

  return facts
    .map((fact) => {
      const question = fact.question.toLowerCase();
      return {
        ...fact,
        terms: fact.terms.filter((term) => !question.includes(term)),
      };
    })
    .filter((fact) => fact.terms.length > 0)
    .slice(0, 3);
}

export function clientProbes(facts: AnswerFact[]): ClientProbe[] {
  return facts.map((fact) => ({ id: fact.id, question: fact.question }));
}

/**
 * Scores a talk. The record future days keep is written by
 * skills/episodic-recall/log_session.py, which drops the words.
 */
export function assessTalk(input: {
  id: string;
  now: Date;
  facts: AnswerFact[];
  narrative: string;
  answers: { id: string; answer: string }[];
  prior: SessionRecord[];
}): SessionRecord {
  const narrative = input.narrative.trim();
  const coreFacts = input.facts.filter(
    (fact) => fact.kind === "place" || fact.kind === "event",
  );
  const detailFacts = input.facts.filter((fact) => fact.kind === "meal");

  const recalled = (fact: AnswerFact) => {
    const answer = input.answers.find((item) => item.id === fact.id)?.answer ?? "";
    return remembered(fact.terms, `${narrative} ${answer}`);
  };

  const rate = (facts: AnswerFact[]) => {
    if (facts.length === 0) {
      return null;
    }
    return facts.filter(recalled).length / facts.length;
  };

  let answered = 0;
  let intrusions = 0;
  for (const fact of input.facts) {
    const answer = input.answers.find((item) => item.id === fact.id)?.answer ?? "";
    const tokens = keywords(answer);
    if (tokens.length === 0) {
      continue;
    }
    answered += 1;
    if (!tokens.some((token) => fact.terms.includes(token))) {
      intrusions += 1;
    }
  }

  const coreRecall = rate(coreFacts);
  const detailRecall = rate(detailFacts);
  const intrusionRate = answered === 0 ? 0 : intrusions / answered;
  const parts = [coreRecall, detailRecall].filter((value): value is number => value !== null);
  const composite =
    parts.length === 0
      ? null
      : Math.round(
          (parts.reduce((sum, value) => sum + value, 0) / parts.length) *
            (1 - 0.5 * intrusionRate) *
            1000,
        ) / 10;

  const completed = input.prior.filter(
    (session) => !session.aborted && session.composite !== null,
  );

  return {
    id: input.id,
    recordedAt: input.now.toISOString(),
    date: dateKey(input.now.getTime()),
    window: "day",
    aborted: false,
    composite,
    coreRecall,
    detailRecall,
    intrusionRate: input.facts.length === 0 ? null : round(intrusionRate),
    confounders: { poorSleep: false, unwellOrAlcohol: false },
    trend:
      composite === null
        ? {
            nPrior: completed.length,
            nPriorClean: cleanSessions(input.prior).length,
            baselineMean: null,
            baselineSd: null,
            z: null,
            flag: "insufficient_baseline",
          }
        : trendFor(input.prior, composite),
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
