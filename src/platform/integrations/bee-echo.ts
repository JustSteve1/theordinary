import type { BeeSnapshot } from "@/src/platform/integrations/bee";

export const ORDINARY_CHECKIN_PREFIX = "Check-in from The Ordinary";

export function isOrdinaryCheckinText(text: string) {
  return text.includes(ORDINARY_CHECKIN_PREFIX);
}

export function withoutOrdinaryEchoes(bee: BeeSnapshot): BeeSnapshot {
  return {
    ...bee,
    conversations: (bee.conversations ?? []).filter(
      (item) =>
        !isOrdinaryCheckinText(item.summary) &&
        !isOrdinaryCheckinText(item.detail),
    ),
    journals: (bee.journals ?? []).filter(
      (item) =>
        !isOrdinaryCheckinText(item.summary) &&
        !isOrdinaryCheckinText(item.detail),
    ),
    facts: (bee.facts ?? []).filter((fact) => !isOrdinaryCheckinText(fact)),
    dailies: (bee.dailies ?? []).filter(
      (daily) => !isOrdinaryCheckinText(daily.summary),
    ),
  };
}
