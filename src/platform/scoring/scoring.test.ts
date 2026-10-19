import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { prepareConfig, loadConfig } from "@/src/platform/scoring/config";
import { factKey } from "@/src/platform/scoring/facts";
import { applySemantic } from "@/src/platform/scoring/matchers/semantic";
import { selectProbes } from "@/src/platform/scoring/probes";
import { rescore } from "@/src/platform/scoring/rescore";
import { scoreTalk } from "@/src/platform/scoring/score";
import { trendBands } from "@/src/platform/scoring/trend";
import type { BeeFact, ScoreInput } from "@/src/platform/scoring/types";
import {
  calibrationReport,
  cohensKappa,
  firstFactorShare,
  icc21,
  proposeWeights,
  quadraticWeightedKappa,
  spearmanBrown,
} from "@/src/platform/scoring/validate";
import { scoreV1 } from "@/src/platform/scoring/v1";
import { keywords } from "@/src/platform/recall/answer-key";

const config = loadConfig();

const facts: BeeFact[] = [
  {
    factId: "f_place",
    kind: "place",
    text: "Home: flat in Hackney",
    key: ["home", "flat", "hackney"],
    entities: [{ name: "Hackney", type: "place" }],
  },
  {
    factId: "f_event",
    kind: "event",
    text: "Dinner with Sam, talked about her new job",
    key: ["dinner", "sam", "talk", "job"],
    entities: [{ name: "Sam", type: "person" }],
  },
  {
    factId: "f_meal",
    kind: "meal",
    text: "Lamb biryani",
    key: ["lamb", "biryani"],
  },
];

function input(talk: string, extra: Partial<ScoreInput> = {}): ScoreInput {
  return {
    recordedAt: "2026-10-19T12:00:00.000Z",
    targetDate: "2026-10-05",
    talkText: talk,
    beeFacts: facts,
    priorNonEmpty: 3,
    ...extra,
  };
}

function dimension(result: ReturnType<typeof scoreTalk>, id: string) {
  const found = result.dimensions.find((item) => item.id === id);
  assert.ok(found, id);
  return found;
}

describe("scoring v2", () => {
  it("builds fact keys with the 8-word cap and keeps short names", () => {
    assert.deepEqual(factKey("Home: flat in Hackney", config), ["home", "flat", "hackney"]);
    assert.deepEqual(factKey("Dinner with Sam, talked about her new job", config), [
      "dinner",
      "sam",
      "talk",
      "job",
    ]);
    const long = factKey(
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet",
      config,
    );
    assert.equal(long.length, 8);
  });

  it("test A abstains the first clause and scores decisions at level 1", () => {
    const result = scoreTalk(
      input("I can't remember anything about a friend at home who talked and we agreed"),
    );
    assert.deepEqual(
      result.clauses.map((clause) => clause.text),
      [
        "I can't remember anything about a friend at home who talked",
        "we agreed",
      ],
    );
    assert.equal(result.clauses[0]?.status, "abstained");
    assert.equal(result.clauses[1]?.status, "internal");
    assert.equal(dimension(result, "people").level, 0);
    assert.equal(dimension(result, "places").level, 0);
    assert.equal(dimension(result, "conversations").level, 0);
    assert.equal(dimension(result, "decisions").level, 1);
    assert.equal(dimension(result, "decisions").display, 33);
    assert.ok(result.facts.every((fact) => fact.score === 0));
    assert.equal(result.metrics.internalDetails, 1);
    assert.equal(result.metrics.externalDetails, 0);
    assert.equal(result.metrics.abstained, 1);
    assert.equal(result.metrics.accuracy, 0);
    assert.equal(result.metrics.richness, 11.7);
    assert.equal(result.conditions.lagDays, 14);
    assert.equal(result.conditions.lagBand, "fortnight");
  });

  it("test B scores the worked example", () => {
    const result = scoreTalk(
      input(
        "Sam came over to my flat. We cooked lamb biryani. She told me about her new job at Monzo, and we agreed to book Lisbon for March. I usually cook on Mondays anyway.",
      ),
    );
    const place = result.facts.find((fact) => fact.factId === "f_place");
    const event = result.facts.find((fact) => fact.factId === "f_event");
    const meal = result.facts.find((fact) => fact.factId === "f_meal");
    assert.equal(place?.score, 0.5);
    assert.equal(place?.status, "PARTIAL");
    assert.equal(event?.score, 1);
    assert.equal(meal?.score, 1);
    assert.equal(dimension(result, "people").level, 3);
    assert.equal(dimension(result, "places").level, 3);
    assert.equal(dimension(result, "conversations").level, 3);
    assert.equal(dimension(result, "decisions").level, 2);
    assert.equal(dimension(result, "decisions").display, 67);
    assert.equal(result.metrics.internalDetails, 4);
    assert.equal(result.metrics.externalDetails, 1);
    assert.equal(result.metrics.accuracy, 87.5);
    assert.equal(result.metrics.richness, 76.3);
    assert.equal(result.clauses.at(-1)?.status, "external");
  });

  it("test C scores probes without letting them change richness", () => {
    const result = scoreTalk(
      input("We stayed in and had dinner.", {
        probes: [
          { id: "p1", question: "Were you at home that evening?", isLure: false, factId: "f_place", answer: "yes" },
          { id: "p2", question: "Did you eat lamb biryani?", isLure: false, factId: "f_meal", answer: "no" },
          { id: "p3", question: "Did you go to the pub in Hackney?", isLure: true, factId: null, answer: "yes" },
        ],
      }),
    );
    assert.equal(result.metrics.recognitionHit, 0.5);
    assert.equal(result.metrics.recognitionFalseAlarm, 1);
    assert.equal(result.metrics.accuracy, 20.8);
    assert.equal(result.metrics.richness, 6.7);
    assert.ok(result.dimensions.every((item) => item.level === 0));
  });

  it("keeps an empty talk and a missing snapshot null", () => {
    const empty = scoreTalk(input("   "));
    assert.equal(empty.flags.emptyTalk, true);
    assert.equal(empty.metrics.accuracy, null);
    assert.equal(empty.metrics.richness, null);
    assert.equal(empty.flags.practice, false);

    const noFacts = scoreTalk(
      input("Sam came over to my flat.", { beeFacts: [], priorNonEmpty: 4 }),
    );
    assert.equal(noFacts.metrics.accuracy, null);
    assert.equal(noFacts.flags.noBeeFacts, true);
    assert.ok((noFacts.metrics.richness ?? 0) > 0);
  });

  it("uses core alone when there is no detail fact", () => {
    const result = scoreTalk(
      input("Sam came over to my flat.", {
        beeFacts: facts.filter((fact) => fact.kind !== "meal"),
      }),
    );
    assert.equal(result.metrics.detail, null);
    assert.equal(result.metrics.recall, result.metrics.core);
  });

  it("ignores a negated conversation", () => {
    const result = scoreTalk(input("We didn't talk about work."));
    assert.equal(dimension(result, "conversations").level, 0);
  });

  it("marks a repeated clause as external", () => {
    const result = scoreTalk(input("I went to the park. I went to the park."));
    assert.equal(result.clauses[1]?.status, "external");
    assert.equal(result.metrics.externalDetails, 1);
  });

  it("recognises a lowercase known person", () => {
    const result = scoreTalk(input("sam came round"));
    assert.ok(dimension(result, "people").level >= 2);
  });

  it("does not split a short and", () => {
    const result = scoreTalk(input("Sam and I went out."));
    assert.equal(result.clauses.length, 1);
    assert.match(result.clauses[0]?.text ?? "", /and/i);
  });

  it("rejects a lure that is too similar to the target fact", () => {
    const matches = facts.map((fact) => ({
      factId: fact.factId,
      kind: fact.kind,
      score: fact.factId === "f_place" ? 0 : 1,
      status: "NOT_MENTIONED" as const,
      clauseId: null,
      evidence: null,
      reason: "",
    }));
    const enabled = prepareConfig(
      JSON.stringify({ ...JSON.parse(readConfig()), probes: { ...JSON.parse(readConfig()).probes, enabled: true } }),
    );
    const probes = selectProbes({
      facts,
      matches,
      history: [
        {
          factId: "old-place",
          kind: "place",
          text: "Home flat Hackney again",
          key: ["home", "flat", "hackney"],
          day: "2026-09-01",
        },
        {
          factId: "far-place",
          kind: "place",
          text: "Office in Leeds",
          key: ["office", "leed"],
          day: "2026-09-01",
        },
      ],
      targetDate: "2026-10-05",
      seedText: "checkin",
      config: enabled,
    });
    assert.equal(probes.some((probe) => probe.factId === "old-place"), false);
    assert.equal(probes.some((probe) => probe.factId === "far-place"), true);
  });

  it("re-scores the same frozen check-in to the same payload", () => {
    const frozen = {
      id: "00000000-0000-4000-8000-000000000010",
      recordedAt: "2026-10-19T12:00:00.000Z",
      targetDate: "2026-10-05",
      talkText: "Sam came over to my flat. We cooked lamb biryani.",
      beeFacts: facts,
      probes: [],
      customItems: [],
      priorNonEmpty: 3,
      v1Facts: [
        {
          id: "f_event",
          kind: "event" as const,
          question: "What happened?",
          terms: ["hackney", "biryani"],
        },
      ],
      v1Rubric: [{ id: "people", label: "People", terms: ["sam"] }],
    };
    assert.deepEqual(rescore(frozen, "2.0.0"), rescore(frozen, "2.0.0"));
    assert.deepEqual(rescore(frozen, "1.0.0"), rescore(frozen, "1.0.0"));
  });

  it("gives a changed config a new hash and leaves the old result untouched", () => {
    const first = scoreTalk(input("Sam came over to my flat."));
    const raw = JSON.parse(readConfig()) as { richness: { weight_dimensions: number } };
    raw.richness.weight_dimensions = 0.2;
    const changed = prepareConfig(`${JSON.stringify(raw)}\n`);
    assert.notEqual(changed.configHash, config.configHash);
    const second = scoreTalk(input("Sam came over to my flat."), changed);
    assert.equal(first.configHash, config.configHash);
    assert.equal(second.configHash, changed.configHash);
    assert.notEqual(first.metrics.richness, second.metrics.richness);
  });

  it("labels the first three non-empty check-ins as practice and keeps them off the trend", () => {
    const flags = [0, 1, 2, 3].map(
      (prior) => scoreTalk(input("Sam came over to my flat.", { priorNonEmpty: prior })).flags.practice,
    );
    assert.deepEqual(flags, [true, true, true, false]);
    const points = [0, 1, 2, 3].map((prior) => {
      const scored = scoreTalk(
        input("Sam came over to my flat.", { priorNonEmpty: prior, targetDate: "2026-10-18" }),
      );
      return {
        id: String(prior),
        recordedAt: `2026-10-1${prior}T12:00:00.000Z`,
        lagBand: scored.conditions.lagBand,
        practice: scored.flags.practice,
        accuracy: scored.metrics.accuracy,
        richness: scored.metrics.richness,
        intrusion: scored.metrics.intrusion,
      };
    });
    const band = trendBands(points, config).find((item) => item.key === "same_or_next");
    assert.equal(band?.practice, 3);
    assert.equal(band?.counted, 1);
  });

  it("does not apply a custom item to a check-in recorded before it existed", () => {
    const earlier = scoreTalk(input("We agreed to book Lisbon for March."));
    assert.equal(earlier.custom.length, 0);
    const later = scoreTalk(
      input("We agreed to book Lisbon for March.", {
        customItems: [{ id: "custom-lisbon", label: "Lisbon", terms: ["lisbon"] }],
      }),
    );
    assert.equal(later.custom[0]?.score, 100);
    assert.equal(later.metrics.richness, earlier.metrics.richness);
  });

  it("discards semantic evidence that is not in the clause", async () => {
    const lexical = scoreTalk(input("Sam came over to my flat."));
    const rejected = await applySemantic({
      matches: lexical.facts,
      clauses: lexical.clauses,
      facts,
      config: { ...config, semanticEnabled: true },
      enabled: true,
      judge: () => ({ score: 1, confidence: 0.9, evidence: "not in the clause" }),
    });
    assert.deepEqual(
      rejected.matches.map((fact) => fact.score),
      lexical.facts.map((fact) => fact.score),
    );
    const accepted = await applySemantic({
      matches: lexical.facts.map((fact) => ({ ...fact, score: 0, status: "NOT_MENTIONED" as const })),
      clauses: lexical.clauses,
      facts,
      config: { ...config, semanticEnabled: true },
      enabled: true,
      judge: () => ({ score: 1, confidence: 0.9, evidence: "my flat" }),
    });
    assert.ok(accepted.matches.some((fact) => fact.score === 1));
    assert.equal(accepted.tier, "semantic");
    const flaggedOff = await applySemantic({
      matches: lexical.facts,
      clauses: lexical.clauses,
      facts,
      config,
      enabled: false,
      judge: () => ({ score: 1, confidence: 1, evidence: "my flat" }),
    });
    assert.equal(flaggedOff.tier, "lexical");
  });
});

describe("scoring v1 freeze", () => {
  it("reproduces the current matcher, including the 8-word cap", () => {
    const factsV1 = [
      {
        id: "event",
        kind: "event" as const,
        question: "What happened?",
        terms: ["extrafact"],
      },
    ];
    const missed = scoreV1({
      talk: "alpha bravo charlie delta echo foxtrot golf hotel extrafact",
      facts: factsV1,
    });
    const hit = scoreV1({ talk: "extrafact happened today", facts: factsV1 });
    assert.equal(keywords("alpha bravo charlie delta echo foxtrot golf hotel extrafact").includes("extrafact"), false);
    assert.equal(missed.metrics.composite, 0);
    assert.equal(hit.metrics.composite, 100);
    assert.deepEqual(missed, scoreV1({ talk: missed.items ? "alpha bravo charlie delta echo foxtrot golf hotel extrafact" : "", facts: factsV1 }));
    assert.equal(missed.scorerVersion, "1.0.0");
  });
});

describe("phase 3 gates", () => {
  it("reports that there is no hand-label sample yet", () => {
    const report = calibrationReport({
      dimensionA: [],
      dimensionB: [],
      factA: [],
      factB: [],
      targets: config.reliability,
    });
    assert.equal(report.meetsDimension, false);
    assert.match(report.reason ?? "", /0 of 40/);
  });

  it("scores perfect agreement as kappa 1 and keeps v2 weights without a study", () => {
    assert.equal(quadraticWeightedKappa([0, 1, 2, 3], [0, 1, 2, 3]), 1);
    assert.equal(cohensKappa([1, 0, 1, 0], [1, 0, 1, 0]), 1);
    assert.ok(spearmanBrown(0.7, 2) > 0.7);
    assert.ok(icc21([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]) > 0.9);
    const levels = [0, 1, 2, 3, 1, 2, 3, 0].map((value) => [value, value, value, value]);
    const columns = [0, 1, 2, 3].map((column) => levels.map((row) => row[column] ?? 0));
    assert.ok(firstFactorShare(columns) >= 0.6);
    const refused = proposeWeights({
      members: 2,
      checkinsPerMember: 4,
      dimensionLevels: columns,
      report: {
        quadraticWeighted: 1,
        factHit: 1,
        sample: 0,
        meetsDimension: false,
        meetsFact: false,
        reason: "none",
      },
      retestIcc: 0.9,
      splitHalf: 0.9,
      targets: config.reliability,
    });
    assert.equal(refused.published, false);
    assert.equal(refused.scorerVersion, "2.0.0");
    assert.equal(config.scorerVersion, "2.0.0");
  });

  it("can name scorer 3.0.0 only when every gate passes", () => {
    const report = calibrationReport({
      dimensionA: Array.from({ length: 40 }, (_, index) => index % 4),
      dimensionB: Array.from({ length: 40 }, (_, index) => index % 4),
      factA: Array.from({ length: 40 }, (_, index) => index % 2),
      factB: Array.from({ length: 40 }, (_, index) => index % 2),
      targets: config.reliability,
    });
    const columns = [0, 1, 2, 3].map(() => Array.from({ length: 30 }, (_, index) => index));
    const proposed = proposeWeights({
      members: 200,
      checkinsPerMember: 10,
      dimensionLevels: columns,
      report,
      retestIcc: 0.9,
      splitHalf: 0.9,
      targets: config.reliability,
    });
    assert.equal(report.meetsDimension, true);
    assert.equal(proposed.published, true);
    assert.equal(proposed.scorerVersion, "3.0.0");
    assert.equal(loadConfig().scorerVersion, "2.0.0");
  });
});

function readConfig() {
  return readFileSync(
    path.join(process.cwd(), "skills/episodic-recall/scoring.config.v2.json"),
    "utf8",
  );
}
