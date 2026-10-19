import type { PreparedConfig } from "@/src/platform/scoring/config";
import { contentStems, rawWords, tokenize } from "@/src/platform/scoring/tokens";
import type { Clause, ClauseStatus } from "@/src/platform/scoring/types";

type Span = { text: string; start: number };

function trimSpan(text: string, start: number): Span | null {
  const leading = text.match(/^\s*/)?.[0].length ?? 0;
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  return { text: trimmed, start: start + leading };
}

function splitSentences(text: string, delimiters: string[]): Span[] {
  const spans: Span[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!delimiters.includes(text[index] ?? "")) {
      continue;
    }
    const piece = trimSpan(text.slice(start, index), start);
    if (piece) {
      spans.push(piece);
    }
    start = index + 1;
  }
  const tail = trimSpan(text.slice(start), start);
  if (tail) {
    spans.push(tail);
  }
  return spans;
}

function splitBoundaries(span: Span, boundaries: string[]): Span[] {
  const lower = span.text.toLowerCase();
  let best: { index: number; length: number } | null = null;
  for (const boundary of boundaries) {
    const index = lower.indexOf(boundary.toLowerCase());
    if (index < 0) {
      continue;
    }
    if (
      !best ||
      index < best.index ||
      (index === best.index && boundary.length > best.length)
    ) {
      best = { index, length: boundary.length };
    }
  }
  if (!best) {
    return [span];
  }
  const left = trimSpan(span.text.slice(0, best.index), span.start);
  const rightStart = best.index + best.length;
  const right = trimSpan(span.text.slice(rightStart), span.start + rightStart);
  return [
    ...(left ? splitBoundaries(left, boundaries) : []),
    ...(right ? splitBoundaries(right, boundaries) : []),
  ];
}

function splitBareAnd(span: Span, config: PreparedConfig): Span[] {
  const lower = span.text.toLowerCase();
  const parts: Span[] = [];
  let chunkStart = 0;
  let search = 0;
  while (search < span.text.length) {
    const index = lower.indexOf(" and ", search);
    if (index < 0) {
      break;
    }
    const left = span.text.slice(chunkStart, index);
    const after = span.text.slice(index + 5);
    const nextWord = after.trim().match(/^[\p{L}\p{N}']+/u)?.[0]?.toLowerCase() ?? "";
    const leftCount = rawWords(left).length;
    if (config.pronouns.has(nextWord) && leftCount >= config.minLeftTokens) {
      const piece = trimSpan(left, span.start + chunkStart);
      if (piece) {
        parts.push(piece);
      }
      chunkStart = index + 5;
      search = chunkStart;
    } else {
      search = index + 5;
    }
  }
  const rest = trimSpan(span.text.slice(chunkStart), span.start + chunkStart);
  if (rest) {
    parts.push(rest);
  }
  return parts;
}

export function segmentClauses(talk: string, config: PreparedConfig) {
  const sentences = splitSentences(talk, config.sentenceDelimiters);
  const spans = sentences.flatMap((sentence) =>
    splitBoundaries(sentence, config.clauseBoundaries).flatMap((span) =>
      splitBareAnd(span, config),
    ),
  );
  return spans.map((span, index) => {
    const tokens = tokenize(span.text, config);
    return {
      id: `c${index + 1}`,
      text: span.text,
      start: span.start,
      end: span.start + span.text.length,
      tokens,
      contentStems: contentStems(tokens),
    };
  });
}

export function tagClauses(
  clauses: ReturnType<typeof segmentClauses>,
  config: PreparedConfig,
): (Clause & { tokens: ReturnType<typeof segmentClauses>[number]["tokens"] })[] {
  const tagged: (Clause & {
    tokens: ReturnType<typeof segmentClauses>[number]["tokens"];
  })[] = [];
  clauses.forEach((clause, index) => {
    const lower = clause.text.toLowerCase();
    const stems = new Set(clause.contentStems);
    let status: ClauseStatus = "internal";
    if (config.abstention.some((phrase) => lower.includes(phrase))) {
      status = "abstained";
    } else if (isHabitual(lower, config) || isMeta(clause.contentStems, config)) {
      status = "external";
    } else if (repeatsEarlier(stems, tagged, config.repetitionJaccard)) {
      status = "external";
    }
    tagged.push({
      id: `c${index + 1}`,
      text: clause.text,
      start: clause.start,
      end: clause.end,
      status,
      contentStems: clause.contentStems,
      tokens: clause.tokens,
    });
  });
  return tagged.filter((clause) => clause.contentStems.length > 0 || clause.status === "abstained");
}

function isHabitual(lower: string, config: PreparedConfig) {
  const words = new Set(rawWords(lower).map((word) => word.toLowerCase()));
  return config.habitual.some((marker) =>
    marker.includes(" ") ? lower.includes(marker) : words.has(marker),
  );
}

function isMeta(stems: string[], config: PreparedConfig) {
  return stems.length > 0 && stems.every((stem) => config.meta.has(stem));
}

function repeatsEarlier(stems: Set<string>, earlier: { contentStems: string[] }[], threshold: number) {
  for (const clause of earlier) {
    const other = new Set(clause.contentStems);
    if (jaccard(stems, other) >= threshold) {
      return true;
    }
  }
  return false;
}

export function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}
