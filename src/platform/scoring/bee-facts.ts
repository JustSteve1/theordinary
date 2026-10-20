import type { BeeSnapshot } from "@/src/platform/integrations/bee";
import { withoutOrdinaryEchoes } from "@/src/platform/integrations/bee-echo";
import { dateKey, londonHour } from "@/src/platform/recall/dates";
import type { BeeFact, FactKind } from "@/src/platform/scoring/types";

const MEAL = /\b(dinner|lunch|breakfast|biryani|cooked|supper|ate)\b/i;
const PLACE = /\b(home|flat|house|office|street|park|kitchen|pub|restaurant|cafe)\b/i;

export function factsForDay(bee: BeeSnapshot, targetDate: string | null): BeeFact[] {
  if (!targetDate || bee.status !== "ok") {
    return [];
  }
  const live = withoutOrdinaryEchoes(bee);
  const facts: BeeFact[] = [];
  const taken = new Set<FactKind>();
  const rows = [
    ...live.conversations.map((conversation) => ({
      at: conversation.startMs,
      text: [conversation.summary, conversation.detail].filter(Boolean).join(". "),
    })),
    ...live.journals.map((journal) => ({
      at: journal.startMs,
      text: [journal.summary, journal.detail].filter(Boolean).join(". "),
    })),
    ...live.dailies.map((daily) => ({ at: daily.atMs, text: daily.summary })),
  ];
  for (const row of rows) {
    const day = dateKey(row.at, live.timezone);
    if (day !== targetDate) {
      continue;
    }
    const text = row.text.replace(/\s+/g, " ").trim();
    if (!text) {
      continue;
    }
    const kind = classify(text, londonHour(row.at, live.timezone), taken);
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
  const live = withoutOrdinaryEchoes(bee);
  return [...live.conversations, ...live.journals].flatMap((note) => {
    const day = dateKey(note.startMs, live.timezone);
    if (day === targetDate) {
      return [];
    }
    const text = [note.summary, note.detail].filter(Boolean).join(". ").trim();
    if (!text) {
      return [];
    }
    const kind = classify(text, londonHour(note.startMs, live.timezone), new Set());
    return [
      {
        factId: `hist-${kind}-${note.startMs}`,
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
