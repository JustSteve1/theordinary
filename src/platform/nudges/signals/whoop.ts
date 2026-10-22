import { loadWhoop } from "@/src/platform/integrations/whoop";
import type { Trigger } from "@/src/platform/nudges/rules";
import type { SignalContext, SignalSource } from "@/src/platform/nudges/signals/types";

const EIGHTEEN_HOURS = 18 * 60 * 60 * 1000;

export function recoveryMetric(input: {
  status: string;
  value: number | null;
  atMs: number | null;
  now: number;
}): Record<string, number> {
  if (input.status !== "ok") {
    return {};
  }
  if (typeof input.value !== "number" || !Number.isFinite(input.value)) {
    return {};
  }
  if (input.atMs === null || !Number.isFinite(input.atMs)) {
    return {};
  }
  const age = input.now - input.atMs;
  if (age < 0 || age > EIGHTEEN_HOURS) {
    return {};
  }
  return { whoop_recovery_today: input.value };
}

export const whoopSource: SignalSource = {
  id: "whoop",
  triggers: ["daily_morning"] satisfies Trigger[],
  async metrics(ctx: SignalContext) {
    try {
      const snapshot = await loadWhoop(ctx.userId);
      return recoveryMetric({
        status: snapshot.status,
        value: snapshot.recovery?.value ?? null,
        atMs: snapshot.recovery?.atMs ?? null,
        now: ctx.now.getTime(),
      });
    } catch (error) {
      console.error("nudge", error instanceof Error ? error.message : error);
      return {};
    }
  },
};
