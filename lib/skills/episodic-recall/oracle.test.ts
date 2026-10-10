import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { trendFor } from "./baseline";
import { recallFactPrompt } from "./fact-prompt";
import { abortReply, consentReply, finishRecall } from "./machine";
import { feedbackPrompt } from "./prompts";
import { scoreRecall, type GroundTruth, type RecallDoc } from "./score";
import { selectWindow, type ConversationInput } from "./window";

const root = new URL(
  "../../../skills/episodic-recall/examples/",
  import.meta.url,
);

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, root), "utf8")) as T;
}

test("window selection matches the python example", () => {
  const selected = selectWindow(
    readJson<ConversationInput[]>("conversations.json"),
    {
      date: "2026-10-09",
      timeZone: "Europe/London",
    },
  );
  assert.equal(selected.eligible, true);
  assert.equal(selected.window, "afternoon");
  assert.equal(selected.total_minutes, 70);
  assert.deepEqual(selected.conversation_ids, [6531525, 6531601]);
  assert.equal(selected.window_start, "2026-10-09T12:00:00+01:00");
  assert.equal(selected.window_end, "2026-10-09T18:00:00+01:00");
  assert.equal(selected.all_windows.evening.n, 1);
  assert.equal(
    selected.conversations.some((item) => item.summary.includes("Sarah")),
    true,
  );
});

test("scoring matches the python example", () => {
  const score = scoreRecall(
    readJson<GroundTruth>("ground_truth.json"),
    readJson<RecallDoc>("recall.json"),
  );
  assert.equal(score.composite, 77.9);
  assert.equal(score.core_recall, 1);
  assert.equal(score.detail_recall, 0.167);
  assert.equal(score.overall_recall, 0.583);
  assert.equal(score.intrusion_rate, 0.125);
  assert.equal(score.unsure_rate, 0.25);
  assert.deepEqual(
    score.matches.map((match) => [
      match.recall_id,
      match.truth_id,
      match.similarity,
      match.via,
    ]),
    [
      ["r-01", "gt-01", 1, "alias"],
      ["r-02", "gt-02", 1, "alias"],
      ["r-04", "gt-07", 1, "text"],
      ["r-05", "gt-08", 1, "alias"],
      ["r-08", "gt-10", 1, "alias"],
      ["r-03", "gt-03", 0.85, "alias"],
      ["r-06", "gt-09", 0.85, "text"],
    ],
  );
  assert.deepEqual(
    score.misses.map((miss) => miss.truth_id),
    ["gt-04", "gt-05", "gt-06", "gt-11", "gt-12"],
  );
  assert.equal(
    score.misses.some((miss) => "text" in miss),
    false,
  );
});

test("baseline flags match the python example", () => {
  const prior: Array<{
    aborted: boolean;
    composite: number;
    confounders: Record<string, never>;
    trend: ReturnType<typeof trendFor>;
  }> = [];
  for (const composite of [71, 68, 74, 70, 66]) {
    const trend = trendFor(prior, composite, false);
    prior.push({ aborted: false, composite, confounders: {}, trend });
  }
  const trend = trendFor(prior, 77.9, false);
  assert.equal(trend.n_prior, 5);
  assert.equal(trend.n_prior_clean, 5);
  assert.equal(trend.baseline_mean, 69.8);
  assert.equal(trend.baseline_sd, 2.7);
  assert.equal(trend.z, 2.99);
  assert.equal(trend.flag, "above_range");
});

test("declining consent reads nothing and abort keeps no score", () => {
  const declined = consentReply("session", false);
  assert.equal(declined.phase, "declined");
  assert.equal(declined.prompt.includes("I won't read anything"), true);
  assert.equal("score" in declined, false);
  const aborted = abortReply("session");
  assert.equal(aborted.phase, "aborted");
  assert.equal("score" in aborted, false);
});

test("feedback does not contain the answer key", () => {
  const truth = readJson<GroundTruth>("ground_truth.json");
  const finished = finishRecall({
    id: "session",
    window: "afternoon",
    groundTruth: {
      ...truth,
      facts: [
        ...truth.facts,
        {
          id: "gt-13",
          type: "person",
          text: "Priya Nair",
          aliases: ["Priya"],
          salience: "core",
        },
      ],
    },
    recall: readJson<RecallDoc>("recall.json"),
    prior: [],
    confounders: { poor_sleep: false, unwell_or_alcohol: false },
  });
  assert.equal(finished.reply.prompt.includes("Priya Nair"), false);
  assert.equal(finished.reply.prompt.includes("Portugal"), false);
  assert.equal(finished.reply.prompt.includes("second floor"), false);
  assert.deepEqual(finished.reveal, [{ type: "person", text: "Priya Nair" }]);
  assert.equal(finished.result.composite !== null, true);
  const prompt = feedbackPrompt({
    window: "afternoon",
    score: finished.score,
    trend: finished.result.trend,
    poorSleep: false,
    unwellOrAlcohol: false,
  });
  assert.equal(prompt.includes("Priya"), false);
});

test("recall extraction prompt is only the person's words", () => {
  const prompt = recallFactPrompt(
    "I met Sam at lunch.",
    "2026-10-09",
    "afternoon",
  );
  assert.equal(prompt.includes("I met Sam at lunch."), true);
  assert.equal(prompt.includes("Portugal"), false);
  assert.equal(prompt.includes("ground truth"), false);
});
