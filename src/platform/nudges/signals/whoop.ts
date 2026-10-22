import { loadWhoop } from "@/src/platform/integrations/whoop";
import type { Trigger } from "@/src/platform/nudges/rules";
import type { SignalContext, SignalSource } from "@/src/platform/nudges/signals/types";

const EIGHTEEN_HOURS = 18 * 60 * 60 * 1000;
const TWO_DAYS = 48 * 60 * 60 * 1000;

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

export type RecoveryReading = { value: number | null; atMs: number | null };

/**
 * Today's recovery minus the most recent earlier recovery within two days.
 * Only reported when today's reading itself qualifies as fresh.
 */
export function recoveryChangeMetric(
  today: Record<string, number>,
  readings: RecoveryReading[],
  now: number,
): Record<string, number> {
  const current = today.whoop_recovery_today;
  if (typeof current !== "number") {
    return {};
  }
  const earlier = readings
    .filter(
      (reading): reading is { value: number; atMs: number } =>
        typeof reading.value === "number" &&
        Number.isFinite(reading.value) &&
        typeof reading.atMs === "number" &&
        Number.isFinite(reading.atMs) &&
        now - reading.atMs > EIGHTEEN_HOURS &&
        now - reading.atMs <= TWO_DAYS,
    )
    .sort((a, b) => b.atMs - a.atMs)[0];
  if (!earlier) {
    return {};
  }
  return { whoop_recovery_vs_yesterday: Math.round(current - earlier.value) };
}

export const whoopSource: SignalSource = {
  id: "whoop",
  triggers: ["daily_morning"] satisfies Trigger[],
  async metrics(ctx: SignalContext) {
    try {
      const snapshot = await loadWhoop(ctx.userId);
      const now = ctx.now.getTime();
      const today = recoveryMetric({
        status: snapshot.status,
        value: snapshot.recovery?.value ?? null,
        atMs: snapshot.recovery?.atMs ?? null,
        now,
      });
      const recoveries = snapshot.recent
        .filter((reading) => reading.kind === "Recovery")
        .map((reading) => ({ value: reading.value, atMs: reading.atMs }));
      return { ...today, ...recoveryChangeMetric(today, recoveries, now) };
    } catch (error) {
      console.error("nudge", error instanceof Error ? error.message : error);
      return {};
    }
  },
};
