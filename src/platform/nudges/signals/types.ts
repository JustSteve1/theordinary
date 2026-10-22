import type { Trigger } from "@/src/platform/nudges/rules";

export type SignalContext = {
  userId: string;
  eventId: string;
  now: Date;
};

export type SignalSource = {
  id: string;
  triggers: Trigger[];
  metrics(ctx: SignalContext): Promise<Record<string, number>>;
};
