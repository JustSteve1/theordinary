import { loadWhoop, type WhoopSnapshot } from "@/src/platform/integrations/whoop";
import { dateKey, formatDay } from "@/src/platform/recall/dates";
import type { ContextSource } from "@/src/platform/context/types";

export function describeWhoop(whoop: WhoopSnapshot) {
  const lines = [
    `WHOOP: ${whoop.status}${whoop.message ? ` (${whoop.message})` : ""}`,
  ];
  for (const reading of whoop.recent) {
    const when = reading.atMs === null ? "" : `${formatDay(dateKey(reading.atMs))} `;
    const body =
      reading.detail ||
      reading.state ||
      (reading.value === null ? "No score" : String(reading.value));
    lines.push(`- ${when}${reading.kind}: ${body}`);
  }
  return lines.join("\n");
}

export const whoopSource: ContextSource = {
  id: "whoop",
  async load(userId) {
    return describeWhoop(await loadWhoop(userId));
  },
};
