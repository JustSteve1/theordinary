import { loadWhoop } from "@/src/platform/integrations/whoop";
import type { ContextSource } from "@/src/platform/context/types";

export const whoopSource: ContextSource = {
  id: "whoop",
  async load(userId) {
    const whoop = await loadWhoop(userId);
    const lines = [`WHOOP: ${whoop.status}${whoop.message ? ` (${whoop.message})` : ""}`];
    for (const [label, score] of [
      ["Recovery", whoop.recovery],
      ["Sleep", whoop.sleep],
      ["Strain", whoop.strain],
    ] as const) {
      if (!score) {
        continue;
      }
      lines.push(
        `- ${label}: ${score.detail || score.state}${score.value !== null ? ` ${score.value}` : ""}`,
      );
    }
    return lines.join("\n");
  },
};
