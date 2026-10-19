import { readFileSync } from "node:fs";
import { join } from "node:path";

import { londonHour } from "@/src/platform/recall/dates";
import type { ProbeLine, ProbeWindow, TalkScript } from "@/src/platform/recall/probe-timing";

type BankOpener = { id?: unknown; text?: unknown };
type BankFollow = { id?: unknown; first?: unknown; second?: unknown };
type BankHandling = { id?: unknown; text?: unknown };

type ProbeBank = {
  v1?: {
    openers?: Partial<Record<ProbeWindow | "day", BankOpener[]>>;
    followUps?: BankFollow[];
    handling?: BankHandling[];
  };
  v2?: unknown;
};

let cached: ProbeBank | null = null;

function readProbeBank() {
  if (!cached) {
    const file = join(process.cwd(), "skills/episodic-recall/probe-bank.json");
    cached = JSON.parse(readFileSync(file, "utf8")) as ProbeBank;
  }
  return cached;
}

function textLine(value: BankOpener | undefined, label: string): ProbeLine {
  if (!value || typeof value.id !== "string" || typeof value.text !== "string") {
    throw new Error(`Probe bank missing ${label}.`);
  }
  const text = value.text.trim();
  if (!text) {
    throw new Error(`Probe bank missing ${label}.`);
  }
  return { id: value.id, text };
}

function handlingLine(rows: BankHandling[] | undefined, id: string): ProbeLine {
  const row = rows?.find((item) => item.id === id);
  return textLine(row, id);
}

export function probeWindow(now = Date.now()): ProbeWindow {
  const hour = londonHour(now);
  if (hour >= 6 && hour < 12) {
    return "morning";
  }
  if (hour >= 12 && hour < 18) {
    return "afternoon";
  }
  return "evening";
}

/**
 * Picks the v1 opener and follow-up pair for this recording.
 * v2 templates stay in the bank file and are not asked.
 */
export function selectScript(priorCompleted: number, now = Date.now()): TalkScript {
  const bank = readProbeBank();
  const window = probeWindow(now);
  const variant = ((priorCompleted % 4) + 4) % 4;
  const opener = textLine(bank.v1?.openers?.[window]?.[variant], `${window} opener ${variant + 1}`);
  const pair = bank.v1?.followUps?.[variant];
  if (
    !pair ||
    typeof pair.id !== "string" ||
    typeof pair.first !== "string" ||
    typeof pair.second !== "string"
  ) {
    throw new Error(`Probe bank missing follow-up pair ${variant + 1}.`);
  }
  const handling = bank.v1?.handling;
  return {
    window,
    opener,
    followUpId: pair.id,
    followUps: [
      { id: `${pair.id}-1`, text: pair.first.trim() },
      { id: `${pair.id}-2`, text: pair.second.trim() },
    ],
    handling: {
      silence: handlingLine(handling, "RH-01"),
      cantRemember: handlingLine(handling, "RH-02"),
      nothing: handlingLine(handling, "RH-03"),
      hint: handlingLine(handling, "RH-06"),
    },
  };
}
