import { beeSource } from "@/src/platform/context/bee";
import { whoopSource } from "@/src/platform/context/whoop";
import type { ContextSource } from "@/src/platform/context/types";

/**
 * The only list the chat reads for outside accounts.
 * Add an integration here. Do not add it in the chat action.
 */
export const integrationSources: ContextSource[] = [beeSource, whoopSource];

export async function integrationRecord(userId: string) {
  const blocks = await Promise.all(
    integrationSources.map((source) => source.load(userId)),
  );
  return blocks.filter((block): block is string => Boolean(block)).join("\n\n");
}
