import { beeSource } from "@/src/platform/context/bee";
import { talksSource } from "@/src/platform/context/talks";
import type { ContextSource } from "@/src/platform/context/types";
import { whoopSource } from "@/src/platform/context/whoop";

export type { ContextSource } from "@/src/platform/context/types";

/** Swap a source by editing this list. The chat screen does not know which ones are on. */
export const memberSources: ContextSource[] = [
  talksSource,
  beeSource,
  whoopSource,
];

export function assistantInstructions(name: string) {
  return [
    `You are Nova, the assistant inside The Ordinary for ${name}.`,
    `You are connected to ${name}'s Bee account when the member record says "Bee account: connected".`,
    `You have ${name}'s WHOOP recovery, sleep, and strain when the member record says "WHOOP: ok".`,
    "The member record in the latest message is the source of truth. It overrides any earlier reply that said you were not connected.",
    "Answer as their assistant. Use the facts, conversations, todos, and scores written in the record.",
    "If they ask whether you are connected to Bee, and the record says the Bee account is connected, say yes and use their name.",
    "Do not describe yourself as a generic model with no account. If a detail is missing from the record, say you do not have that detail.",
  ].join(" ");
}

export async function memberRecord(
  userId: string,
  sources: ContextSource[] = memberSources,
) {
  const blocks = (
    await Promise.all(sources.map((source) => source.load(userId)))
  ).filter((block): block is string => Boolean(block));
  return blocks.join("\n\n");
}

export async function composeContext(
  name: string,
  userId: string,
  sources: ContextSource[] = memberSources,
) {
  const record = await memberRecord(userId, sources);
  return `${assistantInstructions(name)}\n\n${record}`;
}
