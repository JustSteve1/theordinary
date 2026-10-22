import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { localFeatureIds } from "@/src/platform/experiments/activate";
import { buildBeeAnchor } from "@/src/platform/experiments/anchor";
import { validateExperiment, type ExperimentConfig } from "@/src/platform/experiments/config";
import { experimentCardText, planDecision } from "@/src/platform/experiments/plan";
import { randomise } from "@/src/platform/experiments/randomise";

const salt = "experiment-salt-0123456789abcdef";

function validConfig(patch: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    id: "sample",
    version: 1,
    title: "Sample",
    hypothesis: "A filled hypothesis",
    design: "micro_randomised_daily",
    decision_time_local: "08:00",
    arms: [
      { name: "control", instruction: null },
      { name: "treatment", instruction: "Take the stairs." },
    ],
    treatment_probability: 0.5,
    availability: { requires_whoop_yesterday: true, skip_dates: ["2026-12-25"] },
    primary_outcome: { feature_id: "whoop.hrv_rmssd_ms.dev", offset_days: 1, direction: "increase" },
    secondary_outcomes: [
      { feature_id: "recall.accuracy", offset_days: 0, direction: "increase" },
    ],
    min_days: 42,
    max_days: 70,
    notes: "offset 1 is next-morning recovery.",
    ...patch,
  };
}

test("randomiser is deterministic and near one half", () => {
  const once = randomise({
    experimentId: "sample",
    version: 1,
    userId: "member",
    decisionDate: "2026-10-20",
    treatmentProbability: 0.5,
    salt,
  });
  const twice = randomise({
    experimentId: "sample",
    version: 1,
    userId: "member",
    decisionDate: "2026-10-20",
    treatmentProbability: 0.5,
    salt,
  });
  assert.equal(once.randU, twice.randU);
  assert.ok(once.randU >= 0 && once.randU < 1);
  let treated = 0;
  for (let day = 0; day < 10_000; day += 1) {
    const draw = randomise({
      experimentId: "sample",
      version: 1,
      userId: "member",
      decisionDate: String(day).padStart(5, "0"),
      treatmentProbability: 0.5,
      salt,
    });
    if (draw.arm === "treatment") {
      treated += 1;
    }
  }
  const share = treated / 10_000;
  assert.ok(share > 0.45 && share < 0.55, String(share));
});

test("validator rejects TODO and bad configs", () => {
  const draft = JSON.parse(readFileSync("experiments/first-experiment.json", "utf8"));
  const refused = validateExperiment(draft);
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.ok(refused.errors.includes("hypothesis"));
    assert.ok(refused.errors.includes("arms.treatment"));
  }
  const probability = validateExperiment(validConfig({ treatment_probability: 0.95 }));
  assert.equal(probability.ok, false);
  assert.equal(validateExperiment(validConfig()).ok, true);
});

test("the health and mindset experiments activate, with a domain the validator checks", () => {
  for (const [file, domain, whoop] of [
    ["experiments/health-recovery-nudge.json", "health", true],
    ["experiments/mindset-bee-nudge.json", "mindset", false],
  ] as const) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const parsed = validateExperiment(raw);
    assert.equal(parsed.ok, true, file);
    if (parsed.ok) {
      assert.equal(parsed.config.domain, domain);
      assert.equal(parsed.config.availability.requires_whoop_yesterday, whoop);
      assert.equal(parsed.config.primary_outcome.feature_id, "recall.mood");
      const ids = [parsed.config.primary_outcome, ...parsed.config.secondary_outcomes].map(
        (item) => item.feature_id,
      );
      const known = new Set(localFeatureIds());
      for (const id of ids) {
        assert.ok(known.has(id), `${file}: ${id} is not in the feature registry`);
      }
      assert.ok(!JSON.stringify(raw).includes("TODO"), file);
    }
  }
  const wrong = validateExperiment(validConfig({ domain: "sleep" as unknown as "health" }));
  assert.equal(wrong.ok, false);
  if (!wrong.ok) {
    assert.ok(wrong.errors.includes("domain"));
  }
  assert.equal(validateExperiment(validConfig({ domain: "health" })).ok, true);
});

test("the Bee anchor names people and places from an already scored day, or clips one fact", () => {
  const named = buildBeeAnchor("2026-10-20", [
    {
      factId: "f1",
      kind: "event",
      text: "Had biryani with Sam in Hackney after work",
      entities: [
        { name: "Sam", type: "person" },
        { name: "Hackney", type: "place" },
        { name: "Deliveroo", type: "organization" },
      ],
    },
  ]);
  assert.ok(named);
  assert.match(named.line, /Sam and Hackney/);
  assert.ok(!named.line.includes("Deliveroo"));
  assert.ok(!named.line.includes("biryani"));

  const clipped = buildBeeAnchor("2026-10-20", [
    { factId: "f2", kind: "event", text: "x".repeat(200) },
  ]);
  assert.ok(clipped);
  assert.ok(clipped.line.length < 140);
  assert.ok(clipped.line.endsWith("…”"));

  assert.equal(buildBeeAnchor(null, []), null);
  assert.equal(buildBeeAnchor("2026-10-20", []), null);
});

test("decision plans are idempotent and unavailable days have no arm", () => {
  const config = validConfig();
  const first = planDecision({
    config,
    userId: "member",
    decisionDate: "2026-10-20",
    whoopRecent: true,
    salt,
  });
  const second = planDecision({
    config,
    userId: "member",
    decisionDate: "2026-10-20",
    whoopRecent: true,
    salt,
  });
  assert.deepEqual(first, second);
  const seen = new Map<string, typeof first>();
  const key = `${config.id}|${config.version}|member|2026-10-20`;
  seen.set(key, first);
  seen.set(key, second);
  assert.equal(seen.size, 1);
  const skipped = planDecision({
    config,
    userId: "member",
    decisionDate: "2026-12-25",
    whoopRecent: true,
    salt,
  });
  assert.equal(skipped.available, false);
  assert.equal(skipped.arm, null);
  const missing = planDecision({
    config,
    userId: "member",
    decisionDate: "2026-10-21",
    whoopRecent: false,
    salt,
  });
  assert.equal(missing.reason, "no_whoop_yesterday");
  assert.equal(missing.arm, null);
});

test("the home card is absent when nothing is active", () => {
  assert.equal(experimentCardText(null), null);
  assert.equal(
    experimentCardText({ arm: "control", instruction: "Take the stairs." }),
    "Nothing extra today, carry on as normal.",
  );
  assert.equal(experimentCardText({ arm: "treatment", instruction: "Take the stairs." }), "Take the stairs.");
});
