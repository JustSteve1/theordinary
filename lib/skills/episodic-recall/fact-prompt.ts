const SCHEMA = [
  "Return one JSON object and nothing else.",
  "facts is a non-empty list.",
  "Each fact has id, type, and text.",
  "type is one of person, place, activity, topic, decision, time, object, quantity.",
  "text is a short canonical phrase, at most 8 words, with no pronouns and no hedging.",
  "Ground-truth facts also have salience core or detail, aliases as a list, and conversation_id when the fact came from a conversation.",
  "Mark core for the 5 to 10 things a person who was there would be expected to remember: each person, each main activity, the main topic, and any decision. Everything else is detail.",
  "Leave out anything only another speaker knew, other people's private health or money, and speaker labels.",
  "Recall facts also have confidence certain or unsure. Use unsure when the person hedged.",
  "Skip negations. Extract only what the person said.",
].join(" ");

export function groundTruthPrompt(input: {
  date: string;
  window: string;
  summary: string;
  transcripts: string;
}) {
  return [
    "Build the answer key for an episodic recall check-in. Do not address the person.",
    SCHEMA,
    `Date: ${input.date}`,
    `Window: ${input.window}`,
    "Daily summary:",
    input.summary || "(none)",
    "Transcripts:",
    input.transcripts,
  ].join("\n");
}

export function recallFactPrompt(raw: string, date: string, window: string) {
  return [
    "Extract atomic facts from the person's free-recall answer only.",
    "Do not add anything they did not say.",
    SCHEMA,
    `Date: ${date}`,
    `Window: ${window}`,
    "Answer:",
    raw,
  ].join("\n");
}
