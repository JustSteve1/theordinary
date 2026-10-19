import type { FactKind } from "@/src/platform/recall/answer-key";
import { matchesTerms } from "@/src/platform/recall/answer-key";

export type RubricItem = {
  id: string;
  label: string;
  terms: string[];
};

export type ItemScore = {
  id: string;
  label: string;
  score: number;
};

const KIND_LABEL: Record<FactKind, string> = {
  place: "Place",
  meal: "Meal",
  event: "Event",
};

const DIMENSIONS: RubricItem[] = [
  {
    id: "people",
    label: "People",
    terms: [
      "people",
      "person",
      "friend",
      "family",
      "someone",
      "colleague",
      "partner",
      "neighbour",
    ],
  },
  {
    id: "places",
    label: "Places",
    terms: ["place", "places", "home", "house", "office", "street", "kitchen", "outside"],
  },
  {
    id: "conversations",
    label: "Conversations",
    terms: ["talked", "talking", "conversation", "said", "told", "asked", "spoke", "speaking"],
  },
  {
    id: "decisions",
    label: "Decisions",
    terms: ["decided", "decision", "agreed", "plans", "choice", "chosen", "agree"],
  },
];

/** Four probe dimensions, then the current place, meal, and event facts. */
export function defaultRubric(
  facts: { id: string; kind: FactKind; terms: string[] }[],
): RubricItem[] {
  return [
    ...DIMENSIONS.map((item) => ({ ...item, terms: [...item.terms] })),
    ...facts.map((fact) => ({
      id: fact.id,
      label: KIND_LABEL[fact.kind],
      terms: [...fact.terms],
    })),
  ];
}

/** 0 or 100 from the same word match used for a fact. */
export function scoreRubricItem(item: RubricItem, text: string): number {
  if (item.terms.length === 0) {
    return 0;
  }
  return matchesTerms(item.terms, text) ? 100 : 0;
}

export function scoreRubric(items: RubricItem[], text: string): ItemScore[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    score: scoreRubricItem(item, text),
  }));
}

export function cleanRubric(value: unknown): RubricItem[] | null {
  if (!Array.isArray(value) || value.length > 24) {
    return null;
  }
  const items: RubricItem[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 80) : "";
    if (!/^[a-z0-9_-]{1,80}$/i.test(id) || !label || seen.has(id)) {
      return null;
    }
    seen.add(id);
    const terms = Array.isArray(row.terms)
      ? row.terms
          .map((term) => (typeof term === "string" ? term.toLowerCase().trim() : ""))
          .filter((term) => /^[a-z0-9]{4,40}$/.test(term))
          .slice(0, 12)
      : [];
    items.push({ id, label, terms });
  }
  return items;
}
