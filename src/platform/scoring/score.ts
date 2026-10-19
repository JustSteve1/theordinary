import type { PreparedConfig } from "@/src/platform/scoring/config";
import { loadConfig } from "@/src/platform/scoring/config";
import { scoreCustom, scoreDimensions } from "@/src/platform/scoring/dimensions";
import { annotate, knownEntities } from "@/src/platform/scoring/entities";
import { matchFacts } from "@/src/platform/scoring/facts";
import { scoreMetrics } from "@/src/platform/scoring/metrics";
import { contentStems, normalise } from "@/src/platform/scoring/tokens";
import { segmentClauses, tagClauses } from "@/src/platform/scoring/segment";
import type { ScoreInput, ScoreResult } from "@/src/platform/scoring/types";

export function scoreTalk(input: ScoreInput, config: PreparedConfig = loadConfig()): ScoreResult {
  const talk = normalise(input.talkText);
  const lagDays = lagBetween(input.recordedAt, input.targetDate, input.timeZone ?? "Europe/London");
  const lagBand = bandFor(lagDays, config);
  if (!talk) {
    return blank(config, lagDays, lagBand, true);
  }

  const known = knownEntities(input.beeFacts, config);
  const segmented = segmentClauses(talk, config);
  for (const clause of segmented) {
    annotate(clause.tokens, clause.text, known, config);
    clause.contentStems = contentStems(clause.tokens);
  }
  const clauses = tagClauses(segmented, config);
  const { matches, byClause } = matchFacts(input.beeFacts, clauses, config);
  const dimensions = scoreDimensions(clauses, byClause, config);
  const custom = scoreCustom(input.customItems ?? [], clauses, config);
  const internal = clauses.filter((clause) => clause.status === "internal").length;
  const external = clauses.filter((clause) => clause.status === "external").length;
  const abstained = clauses.filter((clause) => clause.status === "abstained").length;
  const metrics = scoreMetrics({
    dimensions,
    facts: matches,
    probes: input.probes ?? [],
    internal,
    external,
    abstained,
    empty: false,
    config,
  });
  const practice = (input.priorNonEmpty ?? 0) < config.practiceCount;
  return {
    scorerVersion: config.scorerVersion,
    configHash: config.configHash,
    matcherTier: "lexical",
    metrics,
    dimensions,
    custom,
    facts: matches,
    clauses: clauses.map((clause) => ({
      id: clause.id,
      text: clause.text,
      start: clause.start,
      end: clause.end,
      status: clause.status,
      contentStems: clause.contentStems,
    })),
    flags: {
      emptyTalk: false,
      noBeeFacts: input.beeFacts.length === 0,
      allAbstained: clauses.length > 0 && abstained === clauses.length,
      lowAsr:
        (input.inputMode ?? "voice") === "voice" &&
        input.asrConfidence != null &&
        input.asrConfidence < config.lowAsr,
      practice,
    },
    conditions: { lagDays, lagBand, practice },
  };
}

function blank(
  config: PreparedConfig,
  lagDays: number | null,
  lagBand: string | null,
  empty: boolean,
): ScoreResult {
  return {
    scorerVersion: config.scorerVersion,
    configHash: config.configHash,
    matcherTier: "lexical",
    metrics: {
      accuracy: null,
      richness: null,
      recall: null,
      core: null,
      detail: null,
      intrusion: null,
      recognitionHit: null,
      recognitionFalseAlarm: null,
      internalDetails: 0,
      externalDetails: 0,
      abstained: 0,
      specificityRatio: null,
    },
    dimensions: config.dimensions.map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      level: 0,
      display: 0,
      evidence: null,
      reason: "Not mentioned",
    })),
    custom: [],
    facts: [],
    clauses: [],
    flags: {
      emptyTalk: empty,
      noBeeFacts: true,
      allAbstained: false,
      lowAsr: false,
      practice: false,
    },
    conditions: { lagDays, lagBand, practice: false },
  };
}

export function lagBetween(recordedAt: string, targetDate: string | null, timeZone: string) {
  if (!targetDate) {
    return null;
  }
  const recorded = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(recordedAt));
  const start = Date.parse(`${recorded}T00:00:00Z`);
  const end = Date.parse(`${targetDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return Math.round((start - end) / 86_400_000);
}

function bandFor(days: number | null, config: PreparedConfig) {
  if (days === null || days < 0) {
    return null;
  }
  return (
    config.lagBands.find((band) => days >= band.min && (band.max === null || days <= band.max))
      ?.key ?? null
  );
}
