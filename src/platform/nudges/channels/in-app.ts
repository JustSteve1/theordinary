import { renderTemplate } from "@/src/platform/nudges/rules";
import { nudgeWhen } from "@/src/platform/nudges/time";
import type { NudgeRow } from "@/src/platform/nudges/types";

export type ChannelView = {
  title: string;
  message: string;
  when: string;
};

export type Channel = {
  id: "in_app";
  render(row: NudgeRow, now: Date): ChannelView | null;
};

export const inApp: Channel = {
  id: "in_app",
  render(row, now) {
    if (row.decision !== "send" || row.status === "held") {
      return null;
    }
    const view = renderTemplate(row.messageKey, row.params);
    if (!view) {
      return null;
    }
    return { ...view, when: nudgeWhen(row.createdAt, now) };
  },
};
