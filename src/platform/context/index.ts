import { beeSource } from "@/src/platform/context/bee";
import { talksSource } from "@/src/platform/context/talks";
import type { ContextSource } from "@/src/platform/context/types";
import { whoopSource } from "@/src/platform/context/whoop";

export type { ContextSource } from "@/src/platform/context/types";

/** Swap a source by editing this list. The chat screen does not know which ones are on. */
export const memberSources: ContextSource[] = [talksSource, beeSource, whoopSource];

export async function composeContext(
  name: string,
  userId: string,
  sources: ContextSource[] = memberSources,
) {
  const blocks = (
    await Promise.all(sources.map((source) => source.load(userId)))
  ).filter((block): block is string => Boolean(block));
  return [
    `You are talking with ${name}.`,
    "Use only the sections below. If something is not written there, say you do not have it.",
    ...blocks,
  ].join("\n\n");
}
