import { listTalks } from "@/src/platform/recall/store";
import type { ContextSource } from "@/src/platform/context/types";

export const talksSource: ContextSource = {
  id: "talks",
  async load(userId) {
    const talks = await listTalks(userId);
    if (talks.length === 0) {
      return null;
    }
    const lines = ["Talks:"];
    for (const talk of talks.slice(-8)) {
      lines.push(`- ${talk.narrative || "(no narrative)"}`);
      for (const answer of talk.answers) {
        if (answer.question || answer.answer) {
          lines.push(`  Asked: ${answer.question || "(question)"}`);
          lines.push(`  They said: ${answer.answer || "(no answer)"}`);
        }
      }
    }
    return lines.join("\n");
  },
};
