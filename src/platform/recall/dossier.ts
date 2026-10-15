import { loadBee, type BeeSnapshot } from "@/src/platform/integrations/bee";
import { loadWhoop, type WhoopSnapshot } from "@/src/platform/integrations/whoop";
import {
  buildAnswerKey,
  type AnswerFact,
} from "@/src/platform/recall/answer-key";
import { dateKey, formatDay } from "@/src/platform/recall/dates";
import { listSessions, listTalks, type StoredTalk } from "@/src/platform/recall/store";
import type { SessionRecord } from "@/src/platform/recall/types";

/** The member record Hello World scores and Nova reads. */
export type MemberDossier = {
  bee: BeeSnapshot;
  whoop: WhoopSnapshot;
  sessions: SessionRecord[];
  talks: StoredTalk[];
  facts: AnswerFact[];
};

export async function loadDossier(userId: string): Promise<MemberDossier> {
  const [bee, whoop, sessions, talks] = await Promise.all([
    loadBee(),
    loadWhoop(userId),
    listSessions(userId),
    listTalks(userId),
  ]);
  const facts = buildAnswerKey({
    bee,
    narratives: talks.map((talk) => ({ id: talk.id, narrative: talk.narrative })),
    allowFixture: process.env.NODE_ENV === "development",
  });
  return { bee, whoop, sessions, talks, facts };
}

export function renderDossier(name: string, dossier: MemberDossier) {
  const lines: string[] = [
    `Member: ${name}`,
    "Use only this record. If it does not say, say you do not have that. Do not diagnose.",
    "",
    "Check-in questions currently drawn from this record. Answer these from the record line, not from a guess:",
  ];

  if (dossier.facts.length === 0) {
    lines.push("No check-in questions yet.");
  }
  for (const fact of dossier.facts) {
    const source = fact.id.startsWith("fixture-")
      ? "development stand-in, Bee has no day yet"
      : fact.id.startsWith("prior-")
        ? "the member's earlier talk"
        : "Bee";
    lines.push(`- Question: ${fact.question}`);
    lines.push(`  Source: ${source}`);
    lines.push(`  Record: ${fact.terms.join(", ")}`);
  }

  lines.push("", "Talks transcribed from Hello World:");
  if (dossier.talks.length === 0) {
    lines.push("None yet.");
  }
  for (const talk of dossier.talks.slice(-8)) {
    lines.push(`- ${talk.narrative || "(no narrative)"}`);
    for (const answer of talk.answers) {
      if (answer.question || answer.answer) {
        lines.push(`  Asked: ${answer.question || "(question)"}`);
        lines.push(`  They said: ${answer.answer || "(no answer)"}`);
      }
    }
  }

  lines.push("", "Scores:");
  const scored = dossier.sessions.filter((session) => session.composite !== null);
  if (scored.length === 0) {
    lines.push("None yet.");
  }
  for (const session of scored.slice(-8)) {
    lines.push(
      `- ${formatDay(session.date)} composite ${session.composite} core ${session.coreRecall ?? "n/a"} detail ${session.detailRecall ?? "n/a"} intrusion ${session.intrusionRate ?? "n/a"}`,
    );
  }

  lines.push("", `Bee: ${dossier.bee.status}`);
  if (dossier.bee.conversations.length === 0) {
    lines.push("No Bee conversations.");
  }
  for (const conversation of dossier.bee.conversations.slice(0, 15)) {
    lines.push(`- ${formatDay(dateKey(conversation.startMs, dossier.bee.timezone))} ${conversation.summary}`);
  }
  if (dossier.bee.openTodos.length > 0) {
    lines.push(`Open todos: ${dossier.bee.openTodos.slice(0, 8).join("; ")}`);
  }

  const whoop = dossier.whoop;
  lines.push("", `WHOOP: ${whoop.status}${whoop.message ? ` (${whoop.message})` : ""}`);
  for (const [label, score] of [
    ["Recovery", whoop.recovery],
    ["Sleep", whoop.sleep],
    ["Strain", whoop.strain],
  ] as const) {
    if (!score) {
      continue;
    }
    lines.push(`- ${label}: ${score.detail || score.state}${score.value !== null ? ` ${score.value}` : ""}`);
  }

  return lines.join("\n");
}
