import { createHash } from "crypto";
import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";

import bundledConfig from "@/skills/episodic-recall/scoring.config.v2.json";

const require = createRequire(import.meta.url);
const snowball = require("snowball-stemmers") as {
  newStemmer: (language: string) => { stem: (word: string) => string };
};

export type LagBand = {
  key: string;
  min: number;
  max: number | null;
};

export type DimensionConfig = {
  id: string;
  label: string;
  generic: Set<string>;
  possessives: Set<string>;
  relationNouns: Set<string>;
  placeNouns: Set<string>;
  minTopic: number;
  minObject: number;
  verify: Set<string>;
};

export type PreparedConfig = {
  scorerVersion: string;
  configHash: string;
  stop: Set<string>;
  minLength: number;
  factKeyMax: number;
  sentenceDelimiters: string[];
  clauseBoundaries: string[];
  pronouns: Set<string>;
  minLeftTokens: number;
  abstention: string[];
  negation: Set<string>;
  negationWindow: number;
  habitual: string[];
  meta: Set<string>;
  repetitionJaccard: number;
  timeWords: Set<string>;
  dimensions: DimensionConfig[];
  genericAll: Set<string>;
  kindFamily: Record<string, "core" | "detail" | null>;
  partialScore: number;
  fullDistinctive: number;
  fullAny: number;
  intrusionWeight: number;
  nullWhenNoFacts: boolean;
  richnessDim: number;
  richnessDensity: number;
  densityTarget: number;
  practiceCount: number;
  lowAsr: number;
  lagBands: LagBand[];
  probesEnabled: boolean;
  maxTrue: number;
  maxLures: number;
  trueMinStems: number;
  lureMinDays: number;
  lureMaxSimilarity: number;
  halfLifeCheckins: number;
  priorRecall: { alpha: number; beta: number };
  priorIntrusion: { alpha: number; beta: number };
  bandQuantiles: [number, number];
  richnessZ: number;
  mcDraws: number;
  seed: number;
  baselineCheckins: number;
  semanticEnabled: boolean;
  semanticPrompt: string;
  requireEvidence: boolean;
  reliability: {
    dimensionKappa: number;
    factKappa: number;
    splitHalf: number;
    icc: number;
    maxFloor: number;
    maxCeiling: number;
    handLabelSample: number;
  };
  stem: (word: string) => string;
};

type RawConfig = {
  scorer_version: string;
  pinned_libraries: { compromise: string; stemmer: string };
  tokenise: { min_token_length: number; fact_key_max_keywords: number };
  stopwords: string[];
  segmentation: {
    sentence_delimiters: string[];
    clause_boundaries: string[];
    and_split: { subject_pronouns: string[]; min_left_tokens: number };
  };
  markers: {
    abstention: string[];
    negation: string[];
    negation_window_tokens: number;
    habitual: string[];
    meta_tokens: string[];
    repetition_jaccard: number;
    time_words_not_entities: string[];
  };
  dimensions: Record<
    string,
    {
      label: string;
      generic_terms?: string[];
      possessives?: string[];
      relation_nouns?: string[];
      place_nouns?: string[];
      min_topic_tokens?: number;
      min_object_tokens?: number;
      verify_with_fact_kinds?: string[];
    }
  >;
  facts: {
    kind_family: Record<string, "core" | "detail" | null>;
    lexical: {
      full_if_distinctive_overlap: number;
      full_if_any_overlap: number;
      partial_score: number;
    };
    semantic: {
      enabled?: boolean;
      judge_prompt_version: string;
      require_evidence_substring: boolean;
    };
  };
  probes: {
    enabled: boolean;
    max_true: number;
    max_lures: number;
    true_probe_min_key_stems: number;
    lure_min_days_apart: number;
    lure_max_similarity: number;
  };
  accuracy: { intrusion_weight: number; null_when_no_bee_facts: boolean };
  richness: {
    weight_dimensions: number;
    weight_density: number;
    density_target_details: number;
  };
  conditions: {
    practice_checkins: number;
    low_asr_confidence: number;
    lag_bands: { key: string; min_days: number; max_days: number | null }[];
  };
  trend: {
    half_life_checkins: number;
    prior_recall: { alpha: number; beta: number };
    prior_intrusion: { alpha: number; beta: number };
    band_quantiles: number[];
    richness_band_z: number;
    mc_draws: number;
    seed: number;
    baseline_checkins: number;
  };
  reliability_targets: {
    dimension_weighted_kappa: number;
    fact_hit_kappa: number;
    split_half_spearman_brown: number;
    test_retest_icc_2_1: number;
    max_floor_share: number;
    max_ceiling_share: number;
    hand_label_sample: number;
  };
};

const stemmer = snowball.newStemmer("english");

export function stemWord(word: string) {
  return stemmer.stem(word.toLowerCase());
}

export function configPath() {
  return path.join(process.cwd(), "skills/episodic-recall/scoring.config.v2.json");
}

export function prepareConfig(rawText: string): PreparedConfig {
  const raw = JSON.parse(rawText) as RawConfig;
  const stem = stemWord;
  const genericAll = new Set<string>();
  const dimensions: DimensionConfig[] = Object.entries(raw.dimensions).map(
    ([id, dimension]) => {
      const generic = new Set((dimension.generic_terms ?? []).map(stem));
      for (const token of generic) {
        genericAll.add(token);
      }
      return {
        id,
        label: dimension.label,
        generic,
        possessives: new Set(
          (dimension.possessives ?? []).map((word) => word.toLowerCase()),
        ),
        relationNouns: new Set((dimension.relation_nouns ?? []).map(stem)),
        placeNouns: new Set((dimension.place_nouns ?? []).map(stem)),
        minTopic: dimension.min_topic_tokens ?? 2,
        minObject: dimension.min_object_tokens ?? 2,
        verify: new Set(dimension.verify_with_fact_kinds ?? []),
      };
    },
  );

  return {
    scorerVersion: raw.scorer_version,
    configHash: createHash("sha256").update(rawText).digest("hex"),
    stop: new Set(raw.stopwords.map((word) => word.toLowerCase())),
    minLength: raw.tokenise.min_token_length,
    factKeyMax: raw.tokenise.fact_key_max_keywords,
    sentenceDelimiters: raw.segmentation.sentence_delimiters,
    clauseBoundaries: raw.segmentation.clause_boundaries,
    pronouns: new Set(
      raw.segmentation.and_split.subject_pronouns.map((word) => word.toLowerCase()),
    ),
    minLeftTokens: raw.segmentation.and_split.min_left_tokens,
    abstention: raw.markers.abstention.map((phrase) => phrase.toLowerCase()),
    negation: new Set(raw.markers.negation.map((word) => word.toLowerCase())),
    negationWindow: raw.markers.negation_window_tokens,
    habitual: raw.markers.habitual.map((word) => word.toLowerCase()),
    meta: new Set(raw.markers.meta_tokens.map(stem)),
    repetitionJaccard: raw.markers.repetition_jaccard,
    timeWords: new Set(
      raw.markers.time_words_not_entities.map((word) => word.toLowerCase()),
    ),
    dimensions,
    genericAll,
    kindFamily: raw.facts.kind_family,
    partialScore: raw.facts.lexical.partial_score,
    fullDistinctive: raw.facts.lexical.full_if_distinctive_overlap,
    fullAny: raw.facts.lexical.full_if_any_overlap,
    intrusionWeight: raw.accuracy.intrusion_weight,
    nullWhenNoFacts: raw.accuracy.null_when_no_bee_facts,
    richnessDim: raw.richness.weight_dimensions,
    richnessDensity: raw.richness.weight_density,
    densityTarget: raw.richness.density_target_details,
    practiceCount: raw.conditions.practice_checkins,
    lowAsr: raw.conditions.low_asr_confidence,
    lagBands: raw.conditions.lag_bands.map((band) => ({
      key: band.key,
      min: band.min_days,
      max: band.max_days,
    })),
    probesEnabled: raw.probes.enabled,
    maxTrue: raw.probes.max_true,
    maxLures: raw.probes.max_lures,
    trueMinStems: raw.probes.true_probe_min_key_stems,
    lureMinDays: raw.probes.lure_min_days_apart,
    lureMaxSimilarity: raw.probes.lure_max_similarity,
    halfLifeCheckins: raw.trend.half_life_checkins,
    priorRecall: raw.trend.prior_recall,
    priorIntrusion: raw.trend.prior_intrusion,
    bandQuantiles: [raw.trend.band_quantiles[0] ?? 0.1, raw.trend.band_quantiles[1] ?? 0.9],
    richnessZ: raw.trend.richness_band_z,
    mcDraws: raw.trend.mc_draws,
    seed: raw.trend.seed,
    baselineCheckins: raw.trend.baseline_checkins,
    semanticEnabled: raw.facts.semantic.enabled === true,
    semanticPrompt: raw.facts.semantic.judge_prompt_version,
    requireEvidence: raw.facts.semantic.require_evidence_substring,
    reliability: {
      dimensionKappa: raw.reliability_targets.dimension_weighted_kappa,
      factKappa: raw.reliability_targets.fact_hit_kappa,
      splitHalf: raw.reliability_targets.split_half_spearman_brown,
      icc: raw.reliability_targets.test_retest_icc_2_1,
      maxFloor: raw.reliability_targets.max_floor_share,
      maxCeiling: raw.reliability_targets.max_ceiling_share,
      handLabelSample: raw.reliability_targets.hand_label_sample,
    },
    stem,
  };
}

let cached: PreparedConfig | null = null;

/** Hashed from the canonical JSON so the hash is the same in tests and in the server bundle. */
export function loadConfig(): PreparedConfig {
  if (!cached) {
    cached = prepareConfig(JSON.stringify(bundledConfig));
  }
  return cached;
}

export function readConfigFile() {
  return readFileSync(configPath(), "utf8");
}
