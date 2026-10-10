import type { Trend } from "./baseline";
import type { FactType, RecallScore } from "./score";
import type { WindowName } from "./window";

export const CONSENT_PROMPT = [
  "I can run a short memory check-in based on your own day. Here's what it involves: I'll quietly read what Bee captured yesterday to build an answer key, then ask you to tell me about part of the day in your own words.",
  "Nothing you say is judged against anyone else — only against your own previous sessions. I'll store a score and the date, plus one short summary line for your Bee facts. I won't store what other people said.",
  "This isn't a medical test and I won't be diagnosing anything. Want to go ahead?",
].join(" ");

export const DECLINED_PROMPT = "No problem. I won't read anything.";

export const CONFOUNDER_PROMPT =
  "Two quick ones first, just yes or no: did you sleep badly last night? And are you feeling unwell today, or did you have a few drinks yesterday?";

export const WAITING_PROMPT =
  "Thanks. I'll read what Bee captured yesterday, then ask you about one part of the day.";

export const ABORT_PROMPT =
  "Let's leave it there — no score for today, and nothing's been saved. We can try another time if you'd like.";

export const INELIGIBLE_PROMPT =
  "There wasn't enough captured yesterday to run a check-in. We can try another day.";

const TYPE_LABEL: Record<FactType, string> = {
  person: "everyone you spoke to",
  place: "the places",
  activity: "what you did",
  topic: "the main topics",
  decision: "the decisions",
  time: "when things happened",
  object: "the things that came up",
  quantity: "the amounts",
};

export function recallPrompt(
  window: WindowName,
  step: "open" | "followup_1" | "followup_2",
) {
  if (step === "followup_1") {
    return "Anything else?";
  }
  if (step === "followup_2") {
    return "Anything else at all, even small things?";
  }
  return `Take your time. Tell me everything you can remember about yesterday ${window} — who you were with, what you talked about, what you did, where you were. Rough is fine; I'll just listen.`;
}

export function feedbackPrompt(input: {
  window: WindowName;
  score: RecallScore;
  trend: Trend;
  poorSleep: boolean;
  unwellOrAlcohol: boolean;
  offer?: boolean;
}) {
  const lines = [
    strongLine(input.score),
    `This session scores ${input.score.composite} out of 100.`,
    trendLine(input.trend, input.poorSleep || input.unwellOrAlcohol),
  ];
  const notes: string[] = [];
  if (input.poorSleep) {
    notes.push("poor sleep");
  }
  if (input.unwellOrAlcohol) {
    notes.push("feeling unwell, or having a few drinks");
  }
  if (notes.length) {
    lines.push(
      `You mentioned ${notes.join(" and ")}, which can affect this, so I've noted that against today's score.`,
    );
  }
  if (input.offer !== false) {
    lines.push(
      `Want me to show you the things from the ${input.window} that didn't come up?`,
    );
  }
  if (input.trend.flag === "review_suggested") {
    lines.push(
      "A few recent sessions have come in below your usual range. On its own that doesn't mean much and there are lots of everyday reasons for it, but it's the kind of pattern worth mentioning to your GP next time you see them. Would you like me to pull together the dates and scores so you have them?",
    );
  }
  return lines.join(" ");
}

function strongLine(score: RecallScore) {
  const strong = Object.entries(score.per_type_recall)
    .filter((entry): entry is [FactType, number] => entry[1] === 1)
    .map(([type]) => TYPE_LABEL[type]);
  if (strong.length === 0) {
    return "Some of the day came back, and some of it did not.";
  }
  if (strong.length === 1) {
    return `You remembered ${strong[0]}.`;
  }
  return `You remembered ${strong.slice(0, -1).join(", ")} and ${strong.at(-1)}.`;
}

function trendLine(trend: Trend, confounded: boolean) {
  if (trend.flag === "insufficient_baseline") {
    const count = trend.n_prior_clean + (confounded ? 0 : 1);
    return `This is session ${count} of 5 before we have a baseline to compare against.`;
  }
  if (trend.flag === "above_range") {
    return "That's a bit above your usual range.";
  }
  if (trend.flag === "below_range" || trend.flag === "review_suggested") {
    return "That's a bit below your usual range.";
  }
  return "That's close to your usual range.";
}
