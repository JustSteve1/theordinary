import { loadBee } from "@/src/platform/integrations/bee";
import { dateKey, formatDay } from "@/src/platform/recall/dates";
import type { ContextSource } from "@/src/platform/context/types";

export const beeSource: ContextSource = {
  id: "bee",
  async load() {
    const bee = await loadBee();
    if (bee.status !== "ok") {
      const reason =
        bee.status === "unauthorized"
          ? "Bee login is required on this machine."
          : "The Bee proxy is not running.";
      return `Bee account: not connected. ${reason}`;
    }

    const lines = [
      "Bee account: connected",
      `Person: ${bee.name ?? "the member"}`,
      `Timezone: ${bee.timezone}`,
    ];
    if (bee.facts.length === 0) {
      lines.push("Facts: none stored.");
    } else {
      lines.push("Facts Bee has learned:");
      for (const fact of bee.facts) {
        lines.push(`- ${fact}`);
      }
    }
    if (bee.dailies.length === 0) {
      lines.push("Daily summaries: none.");
    } else {
      lines.push("Daily summaries:");
      for (const daily of bee.dailies) {
        lines.push(
          `- ${formatDay(dateKey(daily.atMs, bee.timezone))} ${daily.summary}`,
        );
      }
    }
    if (bee.conversations.length === 0) {
      lines.push("Recent conversations: none.");
    } else {
      lines.push("Recent conversations:");
      for (const conversation of bee.conversations) {
        const day = formatDay(dateKey(conversation.startMs, bee.timezone));
        lines.push(`- ${day} ${conversation.summary}`);
        if (
          conversation.detail &&
          conversation.detail !== conversation.summary
        ) {
          lines.push(`  ${conversation.detail}`);
        }
      }
    }
    if (bee.openTodos.length === 0) {
      lines.push("Open todos: none.");
    } else {
      lines.push("Open todos:");
      for (const todo of bee.openTodos.slice(0, 8)) {
        lines.push(`- ${todo}`);
      }
    }
    return lines.join("\n");
  },
};
