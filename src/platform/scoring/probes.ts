import { createHash } from "crypto";

import type { PreparedConfig } from "@/src/platform/scoring/config";
import { jaccard } from "@/src/platform/scoring/segment";
import { resolveKey } from "@/src/platform/scoring/facts";
import type { BeeFact, FactMatch, ScoreProbe } from "@/src/platform/scoring/types";

export function selectProbes(input: {
  facts: BeeFact[];
  matches: FactMatch[];
  history: BeeFact[];
  targetDate: string | null;
  seedText: string;
  config: PreparedConfig;
}): ScoreProbe[] {
  if (!input.config.probesEnabled) {
    return [];
  }
  const scored = new Map(input.matches.map((match) => [match.factId, match.score]));
  const truths = input.facts.filter((fact) => {
    const key = resolveKey(fact, input.config);
    return (scored.get(fact.factId) ?? 0) === 0 && key.length >= input.config.trueMinStems;
  });
  const lures = input.history.filter((old) => {
    if (input.facts.some((fact) => fact.factId === old.factId)) {
      return false;
    }
    const partner = input.facts.find((fact) => fact.kind === old.kind);
    if (!partner) {
      return false;
    }
    if (daysApart(old.day, input.targetDate) < input.config.lureMinDays) {
      return false;
    }
    const similarity = jaccard(
      new Set(resolveKey(old, input.config)),
      new Set(resolveKey(partner, input.config)),
    );
    return similarity < input.config.lureMaxSimilarity;
  });

  const rand = mulberry32(seedFrom(input.seedText));
  const chosenTrue = shuffle(truths, rand).slice(0, input.config.maxTrue);
  const chosenLure = shuffle(lures, rand).slice(0, input.config.maxLures);
  return [
    ...chosenTrue.map((fact) => ({
      id: `true-${fact.factId}`,
      question: yesNo(fact.text),
      isLure: false,
      factId: fact.factId,
    })),
    ...chosenLure.map((fact) => ({
      id: `lure-${fact.factId}`,
      question: yesNo(fact.text),
      isLure: true,
      factId: fact.factId,
    })),
  ];
}

function yesNo(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 240);
  return `Did this happen? ${trimmed}`;
}

function daysApart(left: string | null | undefined, right: string | null) {
  if (!left || !right) {
    return Number.POSITIVE_INFINITY;
  }
  const a = Date.parse(`${left}T00:00:00Z`);
  const b = Date.parse(`${right}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(a - b) / 86_400_000;
}

function seedFrom(text: string) {
  const hex = createHash("sha256").update(text).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16);
}

function shuffle<T>(items: T[], rand: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rand() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swap] as T;
    copy[swap] = current as T;
  }
  return copy;
}

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
