import { integrationRecord } from "@/src/features/integrations/registry";
import { talksSource } from "@/src/platform/context/talks";

export type { ContextSource } from "@/src/platform/context/types";

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

export async function memberRecord(userId: string) {
  const [talks, integrations] = await Promise.all([
    talksSource.load(userId),
    integrationRecord(userId),
  ]);
  return [talks, integrations]
    .filter((block): block is string => Boolean(block))
    .join("\n\n");
}

export async function composeContext(name: string, userId: string) {
  const record = await memberRecord(userId);
  return `${assistantInstructions(name)}\n\n${record}`;
}
