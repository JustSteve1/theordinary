import type { BeeSnapshot } from "@/src/platform/integrations/bee";
import { dateKey, londonHour } from "@/src/platform/recall/dates";
import type { BeeFact, FactKind } from "@/src/platform/scoring/types";

const MEAL = /\b(dinner|lunch|breakfast|biryani|cooked|supper|ate)\b/i;
const PLACE = /\b(home|flat|house|office|street|park|kitchen|pub|restaurant|cafe)\b/i;

export function factsForDay(bee: BeeSnapshot, targetDate: string | null): BeeFact[] {
  if (!targetDate || bee.status !== "ok") {
    return [];
  }
  const facts: BeeFact[] = [];
  const taken = new Set<FactKind>();
  const rows = [
    ...bee.conversations.map((conversation) => ({
      at: conversation.startMs,
      text: [conversation.summary, conversation.detail].filter(Boolean).join(". "),
    })),
    ...bee.dailies.map((daily) => ({ at: daily.atMs, text: daily.summary })),
  ];
  for (const row of rows) {
    const day = dateKey(row.at, bee.timezone);
    if (day !== targetDate) {
      continue;
    }
    const text = row.text.replace(/\s+/g, " ").trim();
    if (!text) {
      continue;
    }
    const kind = classify(text, londonHour(row.at, bee.timezone), taken);
    taken.add(kind);
    facts.push({
      factId: `bee-${kind}-${row.at}`,
      kind,
      text: text.slice(0, 500),
      day,
    });
  }
  return facts;
}

export function historyForLures(bee: BeeSnapshot, targetDate: string | null): BeeFact[] {
  if (bee.status !== "ok") {
    return [];
  }
  return bee.conversations.flatMap((conversation) => {
    const day = dateKey(conversation.startMs, bee.timezone);
    if (day === targetDate) {
      return [];
    }
    const text = [conversation.summary, conversation.detail].filter(Boolean).join(". ").trim();
    if (!text) {
      return [];
    }
    const kind = classify(text, londonHour(conversation.startMs, bee.timezone), new Set());
    return [
      {
        factId: `hist-${kind}-${conversation.startMs}`,
        kind,
        text: text.slice(0, 500),
        day,
      },
    ];
  });
}

function classify(text: string, hour: number, taken: Set<FactKind>): FactKind {
  if (!taken.has("meal") && hour >= 17 && MEAL.test(text)) {
    return "meal";
  }
  if (!taken.has("place") && PLACE.test(text)) {
    return "place";
  }
  return "event";
}
