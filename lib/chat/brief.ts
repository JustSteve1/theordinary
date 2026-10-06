import type { BeeSnapshot } from "@/lib/integrations/bee/client";
import type { WhoopSnapshot } from "@/lib/integrations/whoop/client";
import { dateKey, scoreMembership } from "@/lib/membership/score";

const BRIEF_LIMIT = 8000;

export function beeBriefText(bee: BeeSnapshot) {
  const conversations = bee.conversations
    .slice(0, 8)
    .map(
      (conversation) =>
        `${dateKey(conversation.startMs, bee.timezone)}: ${clip(conversation.summary, 240)}`,
    );
  const dailies = bee.dailies
    .slice(0, 4)
    .map((daily) => dateKey(daily.atMs, bee.timezone));
  const todos = bee.openTodos.slice(0, 10).map((todo) => clip(todo, 160));
  return [
    `Timezone: ${bee.timezone}`,
    "Conversations:",
    conversations.length
      ? conversations.map((line) => `- ${line}`).join("\n")
      : "- none",
    "Daily summaries:",
    dailies.length ? dailies.map((day) => `- ${day}`).join("\n") : "- none",
    "Open todos:",
    todos.length ? todos.map((todo) => `- ${todo}`).join("\n") : "- none",
  ].join("\n");
}

export function membershipBrief(input: {
  name: string;
  timeZone: string;
  now: number;
  bee: BeeSnapshot;
  storedBee: string | null;
  whoop: WhoopSnapshot;
}) {
  const membership = scoreMembership({
    now: input.now,
    timeZone: input.timeZone,
    bee: input.bee,
    whoop: input.whoop,
  });
  const ledger = membership.ledger.length
    ? membership.ledger
        .map(
          (row) => `- ${row.label}: ${clip(row.detail, 180)} (${row.points})`,
        )
        .join("\n")
    : "- nothing scored";
  const bee =
    input.bee.status === "ok"
      ? beeBriefText(input.bee)
      : input.storedBee
        ? `Bee is quiet on this server. Last brief:\n${input.storedBee}`
        : "Bee has not been posted.";
  const text = [
    `Member: ${input.name}`,
    `Timezone: ${input.timeZone}`,
    `This week: ${membership.points} points, ${membership.tier}. Goal 100.`,
    "Ledger:",
    ledger,
    "WHOOP:",
    whoopBrief(input.whoop, input.timeZone),
    "Bee:",
    bee,
  ].join("\n");
  return text.length > BRIEF_LIMIT ? text.slice(0, BRIEF_LIMIT) : text;
}

function whoopBrief(whoop: WhoopSnapshot, timeZone: string) {
  if (whoop.status !== "ok") {
    if (whoop.status === "disconnected") {
      return "Not connected.";
    }
    if (whoop.status === "unconfigured") {
      return "Not configured.";
    }
    return whoop.message ?? "Could not be read.";
  }
  const lines = [
    ...whoop.recovery
      .slice(0, 7)
      .map((score) => scoreLine("Recovery", score, timeZone)),
    ...whoop.sleep
      .slice(0, 7)
      .map((score) => scoreLine("Sleep", score, timeZone)),
    ...whoop.strain
      .slice(0, 7)
      .map((score) => scoreLine("Strain", score, timeZone)),
  ];
  return lines.length ? lines.join("\n") : "Connected, with no recent records.";
}

function scoreLine(
  label: string,
  score: WhoopSnapshot["recovery"][number],
  timeZone: string,
) {
  const day = score.atMs === null ? "undated" : dateKey(score.atMs, timeZone);
  const state = score.state || "unknown";
  return `- ${label} ${day}: ${clip(score.detail, 180)} [${state}]`;
}

function clip(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
