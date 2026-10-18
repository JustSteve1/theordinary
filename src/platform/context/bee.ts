import { loadBee } from "@/src/platform/integrations/bee";
import { dateKey, formatDay } from "@/src/platform/recall/dates";
import type { ContextSource } from "@/src/platform/context/types";

export const beeSource: ContextSource = {
  id: "bee",
  async load() {
    const bee = await loadBee();
    const lines = [`Bee: ${bee.status}`];
    if (bee.conversations.length === 0) {
      lines.push("No conversations.");
    }
    for (const conversation of bee.conversations.slice(0, 15)) {
      lines.push(
        `- ${formatDay(dateKey(conversation.startMs, bee.timezone))} ${conversation.summary}`,
      );
    }
    if (bee.openTodos.length > 0) {
      lines.push(`Open todos: ${bee.openTodos.slice(0, 8).join("; ")}`);
    }
    return lines.join("\n");
  },
};
