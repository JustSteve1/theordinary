import type { Trigger } from "@/src/platform/nudges/rules";
import { checkinsSource } from "@/src/platform/nudges/signals/checkins";
import { experimentsSource } from "@/src/platform/nudges/signals/experiments";
import { moodSource } from "@/src/platform/nudges/signals/mood";
import type { SignalSource } from "@/src/platform/nudges/signals/types";
import { whoopSource } from "@/src/platform/nudges/signals/whoop";

export const signalSources: SignalSource[] = [
  checkinsSource,
  experimentsSource,
  whoopSource,
  moodSource,
];

export async function gatherMetrics(
  trigger: Trigger,
  userId: string,
  eventId: string,
  now: Date,
) {
  const metrics: Record<string, number> = {};
  for (const source of signalSources) {
    if (!source.triggers.includes(trigger)) {
      continue;
    }
    Object.assign(metrics, await source.metrics({ userId, eventId, now }));
  }
  return metrics;
}
