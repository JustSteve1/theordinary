import { copy } from "@/src/platform/recall/copy";

export type SkillPrompt = "consent" | "sleep" | "unwell" | "speak";

export type SkillEvent =
  | { type: "skill.preparing" }
  | { type: "agent.say"; text: string; prompt: SkillPrompt }
  | { type: "agent.listen" }
  | { type: "skill.saving" }
  | {
      type: "skill.aborted";
      reason: "user_stop" | "distress" | "declined_consent";
    }
  | { type: "skill.error"; code: "connection" | "mic" | "skill" };

export type MockScenario =
  | "happy"
  | "slow"
  | "distress"
  | "error_connection"
  | "error_mic"
  | "error_skill";

export function checkInScript(scenario: MockScenario = "happy"): SkillEvent[] {
  const events: SkillEvent[] = [
    { type: "skill.preparing" },
    { type: "agent.say", text: copy.intro, prompt: "consent" },
    { type: "agent.say", text: copy.sleepQuestion, prompt: "sleep" },
    { type: "agent.say", text: copy.unwellQuestion, prompt: "unwell" },
    { type: "agent.say", text: copy.opening, prompt: "speak" },
    { type: "agent.listen" },
  ];

  if (scenario === "distress") {
    events.push({ type: "skill.aborted", reason: "distress" });
    return events;
  }

  events.push(
    { type: "agent.say", text: copy.followUp, prompt: "speak" },
    { type: "agent.listen" },
    { type: "agent.say", text: copy.followUpLast, prompt: "speak" },
    { type: "agent.listen" },
  );

  if (scenario === "error_connection") {
    events.push({ type: "skill.error", code: "connection" });
    return events;
  }
  if (scenario === "error_mic") {
    events.push({ type: "skill.error", code: "mic" });
    return events;
  }
  if (scenario === "error_skill") {
    events.push({ type: "skill.error", code: "skill" });
    return events;
  }

  events.push({ type: "skill.saving" });
  return events;
}

export function isMockScenario(value: string | undefined): value is MockScenario {
  return (
    value === "happy" ||
    value === "slow" ||
    value === "distress" ||
    value === "error_connection" ||
    value === "error_mic" ||
    value === "error_skill"
  );
}

/** Phrases shown only on the wrap-up. They are not written to the session record. */
export const mockMissed = [
  { type: "event", text: "A walk after lunch" },
  { type: "person", text: "A short call with a friend" },
];
