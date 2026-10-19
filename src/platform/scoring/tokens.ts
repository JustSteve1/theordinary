import type { PreparedConfig } from "@/src/platform/scoring/config";
import type { EntityType } from "@/src/platform/scoring/types";

export type Token = {
  text: string;
  lower: string;
  stem: string;
  index: number;
  negated: boolean;
  entity: EntityType | null;
  content: boolean;
};

const SPLIT = /[^\p{L}\p{N}']+/u;

export function normalise(text: string) {
  return text.normalize("NFKC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

export function rawWords(text: string) {
  return text.split(SPLIT).filter(Boolean);
}

export function tokenize(text: string, config: PreparedConfig): Token[] {
  const words = rawWords(text);
  const tokens: Token[] = words.map((word, index) => ({
    text: word,
    lower: word.toLowerCase(),
    stem: config.stem(word.toLowerCase()),
    index,
    negated: false,
    entity: null,
    content: false,
  }));
  for (const token of tokens) {
    for (let back = 1; back <= config.negationWindow; back += 1) {
      const previous = tokens[token.index - back];
      if (previous && config.negation.has(previous.lower)) {
        token.negated = true;
        break;
      }
    }
  }
  for (const token of tokens) {
    const longEnough = token.lower.length >= config.minLength;
    const entityExempt = token.entity !== null;
    token.content = !config.stop.has(token.lower) && (longEnough || entityExempt);
  }
  return tokens;
}

export function refreshContent(tokens: Token[], config: PreparedConfig) {
  for (const token of tokens) {
    const longEnough = token.lower.length >= config.minLength;
    token.content = !config.stop.has(token.lower) && (longEnough || token.entity !== null);
  }
}

export function contentStems(tokens: Token[], includeNegated = false) {
  const stems: string[] = [];
  for (const token of tokens) {
    if (!token.content) {
      continue;
    }
    if (token.negated && !includeNegated) {
      continue;
    }
    stems.push(token.stem);
  }
  return stems;
}
