import { db, ready } from "@/src/platform/db";
import { formatDay } from "@/src/platform/recall/dates";
import type { BeeFact } from "@/src/platform/scoring/types";

export type BeeAnchor = {
  /** Calendar day the facts belong to. Always an already-scored day. */
  day: string;
  /** Short, rendered line. Lives on the page only; never stored on a decision or exported. */
  line: string;
};

const MAX_NAMES = 3;
const MAX_FACT_CHARS = 90;

/**
 * Builds a one-line anchor from facts that were already scored and revealed.
 * Facts about yesterday are tonight's answer key, so they are never used here.
 */
export function buildBeeAnchor(day: string | null, facts: BeeFact[]): BeeAnchor | null {
  if (!day || facts.length === 0) {
    return null;
  }
  const names: string[] = [];
  for (const fact of facts) {
    for (const entity of fact.entities ?? []) {
      const name = entity.name.trim();
      if (name && (entity.type === "person" || entity.type === "place") && !names.includes(name)) {
        names.push(name);
      }
      if (names.length === MAX_NAMES) break;
    }
    if (names.length === MAX_NAMES) break;
  }
  if (names.length > 0) {
    return { day, line: `On ${formatDay(day)} Bee heard about ${joinNames(names)}.` };
  }
  const text = facts.find((fact) => fact.text.trim())?.text.trim();
  if (!text) {
    return null;
  }
  const clipped = text.length > MAX_FACT_CHARS ? `${text.slice(0, MAX_FACT_CHARS - 1).trimEnd()}…` : text;
  return { day, line: `On ${formatDay(day)} Bee heard: “${clipped}”` };
}

export async function beeAnchorFor(userId: string): Promise<BeeAnchor | null> {
  await ready();
  const rows = await db()`
    select target_date::text as target_date, bee_snapshot
    from checkins
    where user_id = ${userId}
      and target_date is not null
      and jsonb_array_length(bee_snapshot) > 0
    order by recorded_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  const facts = Array.isArray(row.bee_snapshot) ? (row.bee_snapshot as BeeFact[]) : [];
  return buildBeeAnchor(String(row.target_date).slice(0, 10), facts);
}

function joinNames(names: string[]) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
