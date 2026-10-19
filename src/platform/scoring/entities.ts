import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nlp = require("compromise") as (text: string) => {
  people: () => { out: (format: "array") => string[] };
  places: () => { out: (format: "array") => string[] };
  organizations: () => { out: (format: "array") => string[] };
};

import type { PreparedConfig } from "@/src/platform/scoring/config";
import { rawWords, refreshContent, type Token } from "@/src/platform/scoring/tokens";
import type { BeeFact, EntityType } from "@/src/platform/scoring/types";

export type KnownEntity = { name: string; type: EntityType };

export function knownEntities(facts: BeeFact[], config: PreparedConfig): KnownEntity[] {
  const found: KnownEntity[] = [];
  const seen = new Set<string>();
  const add = (name: string, type: EntityType) => {
    const key = name.toLowerCase();
    if (!key || config.timeWords.has(key) || seen.has(key)) {
      return;
    }
    seen.add(key);
    found.push({ name, type });
  };

  for (const fact of facts) {
    for (const entity of fact.entities ?? []) {
      add(entity.name, entity.type);
    }
    const type: EntityType =
      fact.kind === "place" ? "place" : fact.kind === "meal" ? "unknown" : "person";
    for (const name of capitalisedNames(fact.text, config)) {
      add(name, type);
    }
  }
  return found;
}

export function capitalisedNames(text: string, config: PreparedConfig) {
  const names: string[] = [];
  let sentenceStart = true;
  for (const word of rawWords(text)) {
    const lower = word.toLowerCase();
    const capital =
      word[0] === word[0]?.toUpperCase() && word[0] !== word[0]?.toLowerCase();
    if (capital && !sentenceStart && !config.timeWords.has(lower)) {
      names.push(word);
    }
    sentenceStart = false;
  }
  return names;
}

export function annotate(tokens: Token[], text: string, known: KnownEntity[], config: PreparedConfig) {
  const byName = new Map(known.map((entity) => [entity.name.toLowerCase(), entity.type]));
  for (const token of tokens) {
    const knownType = byName.get(token.lower);
    if (knownType && knownType !== "unknown") {
      token.entity = knownType;
    }
  }

  const doc = nlp(text);
  mark(doc.people().out("array"), "person", tokens, config);
  mark(doc.places().out("array"), "place", tokens, config);
  mark(doc.organizations().out("array"), "organization", tokens, config);

  let sentenceStart = true;
  for (const token of tokens) {
    const capital =
      token.text[0] === token.text[0]?.toUpperCase() &&
      token.text[0] !== token.text[0]?.toLowerCase();
    if (
      capital &&
      !sentenceStart &&
      !token.entity &&
      !config.timeWords.has(token.lower)
    ) {
      token.entity = "unknown";
    }
    sentenceStart = false;
  }
  refreshContent(tokens, config);
}

function mark(spans: string[], type: EntityType, tokens: Token[], config: PreparedConfig) {
  for (const span of spans) {
    for (const word of rawWords(span)) {
      const lower = word.toLowerCase();
      if (config.timeWords.has(lower)) {
        continue;
      }
      const token = tokens.find((item) => item.lower === lower && !item.entity);
      if (token) {
        token.entity = type;
      }
    }
  }
}
