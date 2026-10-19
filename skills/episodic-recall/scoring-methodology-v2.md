# The Ordinary: Recall Scoring Methodology v2

Working spec for the check-in scorer. It replaces the 0-or-100 word matcher with a scorer that reads the whole talk, grades how specific each answer is, checks facts against Bee with hits and false alarms, records the conditions of each check-in, versions every score, and shows the trend with uncertainty.

Companion file: `scoring.config.v2.json`. Every word list, weight and threshold in this spec lives there, not in code.

Status: **Proposed.** Nothing here is locked until the Decision log (section 14) says so.

---

## 0. Instructions for Cursor

1. Read the whole spec before changing code. Implement in the phase order in section 12. Do not start a phase until the previous phase's tests pass.
2. **Phase 0 comes first:** freeze today's logic as scorer `v1.0.0`, including the first-8-words cap, and start storing raw inputs. Nothing else changes in Phase 0.
3. Write the acceptance tests in section 13 before writing the scoring code for each phase.
4. All lexicons, weights and thresholds are read from `scoring.config.v2.json`. A config change produces a new `config_hash`. A logic change bumps `scorer_version`.
5. Never overwrite a score. A new version writes a new score run, and the dashboard reads the latest run.
6. If a rule here is ambiguous, stop and ask. Do not pick silently.

---

## 1. What the check-in measures

A check-in asks a member to recall a **target day** that Bee recorded. It produces two headline numbers that measure different things and are never blended in v2:

| Number | Question it answers | Anchored to |
|---|---|---|
| **Accuracy** | Did they remember what actually happened? | Bee facts for the target day |
| **Richness** | How specific and full was the recall? | The talk itself |

Accuracy is the continuation of today's trend composite, with the same formula shape, so the existing baseline keeps its meaning once history is re-scored. Richness is new.

The four dimensions (People, Places, Conversations, Decisions) become a breakdown inside Richness, graded 0 to 3 instead of 0 or 100.

### Why v1 is replaced

v1 scored "I can't remember anything about a friend at home who talked and we agreed" as 100 on all four dimensions. It credited category words, read only the first 8 kept words, ignored "can't remember", and had intrusion fixed at 0. v2 fixes each of these:

| v1 problem | v2 rule | Source of the idea |
|---|---|---|
| First 8 words only | Whole talk, split into clauses | Bug fix (the 8-word cap belongs to building Bee fact keys only) |
| Category word = 100 | Ordinal levels: generic, specific, verified | Autobiographical Interview scoring; Autorubric |
| "Can't remember" scored as a hit | Abstention and negation are detected per clause | Autorubric abstention handling |
| Intrusion always 0 | False claims and lure answers count as false alarms | Signal detection (Flowers test battery) |
| Recall delay ignored | Lag recorded as a condition; trend split by lag band | Difficulty-level reporting (Flowers test battery) |
| First check-ins count | First check-ins flagged as practice | Practice trials excluded (Flowers test battery) |
| Daily 0/100 jumps | Bayesian trend with a credible band | Bayesian estimation (Flowers test battery) |
| Baseline frozen to protect meaning | Raw data stored, scorer versioned, history re-scored | Trial-level storage (Flowers test battery) |

---

## 2. Inputs

### 2.1 Check-in (immutable once written)

| Field | Type | Notes |
|---|---|---|
| `checkin_id` | string | |
| `member_id` | string | |
| `recorded_at` | ISO datetime | When the member spoke |
| `target_date` | ISO date | The day being recalled (the Bee day) |
| `talk_text` | string | Full transcript of the talk. Never truncated. |
| `input_mode` | `voice` \| `typed` | |
| `asr_confidence` | number \| null | Mean transcript confidence if available |
| `probes` | Probe[] | Structured yes/no questions asked (section 6). May be empty. |
| `bee_snapshot` | BeeFact[] | Copy of the Bee facts for `target_date` **at the time of the check-in**. Stored so later Bee edits cannot change old scores silently. |
| `flow_items` | number[] \| null | Optional Flow Short Scale answers. Stored, not scored here. |

### 2.2 Bee fact

| Field | Type | Notes |
|---|---|---|
| `fact_id` | string | |
| `kind` | `place` \| `event` \| `meal` \| `person` \| `conversation` \| `decision` | Today Bee supplies place, event, meal. |
| `text` | string | Bee's wording |
| `key` | string[] | Built by `keywords()` in `answer-key.ts`: stemmed, stop words removed, **max 8**. This is the one place the 8 cap belongs. |
| `entities` | string[] | Capitalised names in `text` (for example "Sam", "Hackney") |
| `difficulty` | number \| null | Population recall rate for this kind and lag band. Null until Phase 3. |

Fact kinds map to the two accuracy families (config `facts.kind_family`):

- **core:** place, event, person
- **detail:** meal

conversation and decision facts are accepted but carry no family in v2. They only verify dimensions.

---

## 3. Pipeline overview

```
talk_text
  └─ 4.1 normalise
  └─ 4.2 split into sentences, then clauses
  └─ 4.3 tag each clause: abstained? negated tokens? external?
  └─ 4.4 tokens: lowercase, stop words out, min length 3, Porter2 stem
  └─ 4.5 entities: people / places / orgs (compromise NER + member's known entities)
        │
        ├─ 5. Fact matching against bee_snapshot  ──►  fact scores 0 / 0.5 / 1, claims
        ├─ 6. Probe answers (true and lure)       ──►  hits, false alarms
        ├─ 7. Dimension levels 0–3                ──►  per-dimension breakdown
        └─ 8. Detail counts                       ──►  internal / external
                    │
                    ▼
        9. Metrics: Accuracy, Richness, Recognition (H, FA), flags
        10. Conditions: lag band, practice, coverage
        11. Trend with credible band (per member, per lag band)
```

---

## 4. Reading the talk

### 4.1 Normalise

- Unicode NFKC. Curly quotes and apostrophes become straight (`’` → `'`).
- Keep the original string and record character offsets for every clause, so evidence spans can be shown.
- Do not lowercase until tokenising. Capitals are needed for entity detection.

### 4.2 Segment into clauses

Deterministic rules, in this order (config `segmentation`):

1. Split into sentences on `.`, `!`, `?` and line breaks.
2. Within a sentence, split on these boundaries: `, and`, `, but`, `, so`, `;`, ` but `, ` so `, ` then `, ` and then `.
3. Split on a bare ` and ` **only** when the word after it is a subject pronoun (`i`, `we`, `he`, `she`, `they`, `you`) **and** the left side has at least 3 tokens. This splits "…who talked and we agreed" but not "Sam and I went out" or "salt and pepper".
4. Drop clauses with no content tokens.

ASR transcripts often arrive without punctuation. Rule 3 is the main defence. Phase 2 can swap in a model segmenter behind the same interface.

### 4.3 Tag each clause

**Abstained.** The clause contains an abstention marker (config `markers.abstention`, for example "can't remember", "don't know", "no idea", "not sure"). An abstained clause earns nothing: no dimension credit, no fact hit, not counted as a detail. Abstention scope ends at the clause boundary.

**Negated tokens.** A token is negated if a negation marker (config `markers.negation`) appears within the 3 tokens before it in the same clause. Negated tokens cannot trigger a dimension or a fact hit.

**External.** The clause is not about the target day. Any of these makes a clause external:
- it contains a habitual marker (usually, always, normally, every, tend…),
- every content token is a meta phrase (anyway, you know, to be honest…),
- its content stems overlap an earlier clause with Jaccard ≥ 0.8 (repetition).

External clauses do not earn dimension credit or fact hits. They count towards the external detail total.

**Internal.** Any clause that is not abstained and not external.

### 4.4 Tokens

- Lowercase, split on anything that is not a letter, digit or apostrophe.
- Remove stop words (config `stopwords`). The list includes common filler adjectives (new, nice, good, really) so they cannot create false fact hits.
- Minimum length **3** (was 4). This keeps pub, ate, mum, dad, tea. Recognised entities are exempt from the minimum.
- Stem with Porter2. All lexicons and fact keys are stemmed at load time, so `talked`, `talking` and `talk` match.
- No cap on the number of tokens.

### 4.5 Entities

An entity is a person, place or organisation name. A token or phrase is an entity if any of these apply:

1. `compromise` NER returns it from `.people()`, `.places()` or `.organizations()`. Pin the library version; it is part of `config_hash`.
2. It is in the member's **known entities**: names that appear in any of their Bee facts (target day and history), typed by the fact kind they came from. This catches lowercase ASR names.
3. It is capitalised, not sentence-initial, and not a month or day name. These are typed `unknown`.

Months and day names are time details, not entities.

---

## 5. Fact matching (Accuracy)

### 5.1 Matcher interface

```ts
interface FactMatcher {
  tier: "lexical" | "semantic";
  match(clause: Clause, fact: BeeFact): FactMatch;
}
interface FactMatch {
  score: 0 | 0.5 | 1;              // none / partial / full
  verdict: "MATCH" | "PARTIAL" | "CONTRADICTS" | "NOT_MENTIONED";
  evidence: { start: number; end: number; text: string } | null;
  reason: string;                  // short, human-readable
}
```

A fact's score for the check-in is the **maximum** over all internal clauses.

### 5.2 Lexical tier (Phase 1, deterministic)

Let `overlap` = the non-negated stems of the clause ∩ the fact key.

A key stem is **distinctive** if it is not in any dimension's generic lexicon. For example `hackney`, `biryani` and `sam` are distinctive; `home`, `flat` and `talk` are generic.

| Condition | Score | Verdict |
|---|---|---|
| overlap contains ≥ 1 distinctive stem, or ≥ 2 stems of any kind | 1 | MATCH |
| overlap is exactly 1 generic stem, and the key has at least one distinctive stem | 0.5 | PARTIAL |
| overlap is exactly 1 generic stem, and the key has no distinctive stems | 1 | MATCH |
| no overlap | 0 | NOT_MENTIONED |

The lexical tier never returns CONTRADICTS. It cannot tell "pizza" (wrong) from "pizza for lunch" (also true). Contradictions come from probes (section 6) and from the semantic tier.

### 5.3 Semantic tier (Phase 2)

Uses an LLM judge, with one call per (check-in, fact) pair, as in Autorubric's one-criterion-per-call rule. Temperature 0. The prompt version and model id are stored on the score run.

Prompt contract:

```
You compare a person's spoken recall of a day with one fact recorded that day.
FACT ({kind}): "{fact.text}"
RECALL: "{talk_text}"
Return JSON only:
{"verdict": "MATCH" | "PARTIAL" | "CONTRADICTS" | "NOT_MENTIONED" | "ABSTAINED",
 "evidence": "<exact quote from RECALL, or empty>",
 "reason": "<25 words max>"}
MATCH = the recall states this fact, in any wording.
PARTIAL = the recall states the right kind of thing but only generically.
CONTRADICTS = the recall states something incompatible with this fact for the same part of the day.
NOT_MENTIONED = the recall says nothing about it. Something Bee did not record is NOT a contradiction.
ABSTAINED = the person says they cannot remember this.
```

Guards:
- If `evidence` is not an exact substring of `talk_text`, downgrade the verdict to NOT_MENTIONED (anti-hallucination).
- Cache by `hash(talk_text, fact.text, prompt_version, model_id)`.
- Map scores: MATCH = 1, PARTIAL = 0.5, everything else = 0. CONTRADICTS also creates a false claim (section 9.1).

Optional cheaper variant: embedding cosine between clause and fact text, with full ≥ `semantic.full_threshold` and partial ≥ `semantic.partial_threshold`. Both thresholds must be calibrated (section 11.3) before use.

---

## 6. Probes and lures (recognition)

Probes are short yes/no questions asked after free recall. Their purpose is to measure false alarms directly.

### 6.1 Selection (config `probes`)

Per check-in, ask at most `max_true` true probes and `max_lures` lures (defaults 2 and 1).

- **True probe:** a Bee fact from the target day that the member did **not** already mention in free recall, and that has at least 2 key stems (vague facts cannot be scored).
- **Lure:** a fact of the **same kind** from the member's own Bee history, taken from a date at least `lure_min_days_apart` days away from the target day (default 7). Reject it if its key overlaps any target-day fact key with Jaccard ≥ `lure_max_similarity` (default 0.2). Same-member lures are realistic, which is what makes false alarms meaningful.
- Shuffle probe order with a seed derived from `checkin_id`.
- Probes are asked **after** free recall, so they cannot prompt it. Fact text for true probes stays hidden in chat and in the transcript tile, as today.

### 6.2 Scoring

| Probe | Answer yes | Answer no | Don't know |
|---|---|---|---|
| True | hit | miss | abstained |
| Lure | **false alarm** | correct rejection | abstained |

Per check-in, store hit rate `H = hits / true probes answered` and false-alarm rate `FA = false alarms / lures answered`. Abstentions are excluded from both denominators and counted separately.

d′ is **not** computed per check-in, because there are too few probes. It is pooled over the last `trend.dprime_window` check-ins (default 10). It needs at least 4 true probes and 2 lures, and uses the log-linear correction:

```
H_adj  = (hits + 0.5) / (true_probes + 1)
FA_adj = (false_alarms + 0.5) / (lures + 1)
d'     = z(H_adj) − z(FA_adj)
```

---

## 7. Dimensions (Richness breakdown)

Four default dimensions plus any custom items. Each is scored per clause, then the dimension takes the **maximum** over internal clauses.

### 7.1 Levels

| Level | Name | Rule |
|---|---|---|
| 0 | Absent | No qualifying mention in any internal clause |
| 1 | Generic | A generic trigger from the dimension lexicon appears (non-negated) |
| 2 | Specific | The dimension's specific rule fires (7.2). A trigger is not required. |
| +1 | Verified | Level ≥ 1, **and** the same clause has a fact match with score ≥ 0.5 on a fact kind mapped to this dimension |

`level = min(3, base_level + verified)`. So generic + verified = 2, specific = 2, specific + verified = 3.

Display score = `round(level / 3 × 100)`, which gives 0, 33, 67 or 100. Keep a legacy boolean `hit = level ≥ 1` for anything still expecting v1.

### 7.2 Specific rules (lexical tier)

| Dimension | Specific (level 2) when the clause has… | Verified by fact kinds |
|---|---|---|
| People | a person entity, **or** a possessive (my/our/his/her/their) followed by a relation noun (my sister, our boss) | event, person |
| Places | a place or organisation entity, **or** a possessive followed by a place noun (my flat, our kitchen) | place, event |
| Conversations | a speech trigger **and** ≥ 2 other content tokens (a topic: "told me about her new job at Monzo") | event, conversation |
| Decisions | a decision trigger **and** ≥ 2 other content tokens (an object: "agreed to book Lisbon for March") | event, decision |

"Other content tokens" excludes the trigger itself and any word from any dimension's generic lexicon.

Entities typed `unknown` (capitalised, but neither NER nor the known-entity list could type them) count as content tokens but do **not** make People or Places specific. Tests A to C do not depend on how NER types Monzo or Lisbon.

Possessive and negation patterns are read from the clause's **raw** token sequence, before stop words are removed. "my", "her" and "didn't" are stop words, but they still have to be visible to these rules.

Phase 2 can replace these rules with the LLM judge, using one call per dimension, returning a level 0 to 2 plus an evidence quote. Verification stays rule-based.

### 7.3 Custom items

Items a member adds on the dashboard:
- Binary: 0 or 100. A hit is any non-negated term from the item's list in any internal clause, read over the whole talk.
- Terms are 3 to 40 letters (was 4 to 40), stemmed.
- Apply from the **next** recording, as today.
- Shown in the breakdown, **excluded** from Richness until a custom item has enough data to validate it.

---

## 8. Detail counts

- `internal_details` = number of internal clauses with at least one content token.
- `external_details` = number of external clauses.
- Abstained clauses count towards neither. They are counted in `abstained_clauses`.
- `specificity_ratio` = internal ÷ (internal + external). It is 0 if both are 0.

The Phase 2 option is the open model `vangenugtenr/autobiographical_interview_scoring` (distilBERT, Hugging Face), which predicts how much of each sentence is internal (0, 50, 75 or 100%). Its use must be validated on your transcripts first. It was trained on punctuated lab interviews.

---

## 9. Metrics

### 9.1 Accuracy (continuation of the v1 composite)

```
core     = mean(fact scores for core facts)      — skip if there are no core facts
detail   = mean(fact scores for detail facts)    — skip if there are no detail facts
recall   = mean(core, detail over the families that exist)

true_claims  = (facts with score > 0) + (true probes answered yes)
false_claims = (CONTRADICTS verdicts) + (lures answered yes)
intrusion    = false_claims / (true_claims + false_claims)   — 0 if there are no claims

accuracy = round(recall × (1 − w_intrusion × intrusion) × 100, 1)    w_intrusion = 0.5
```

- If `bee_snapshot` is empty, `accuracy = null`, not 0. There was nothing to be accurate about.
- Recall uses **free recall only**. Probes affect intrusion, not recall, because recognition is easier than recall and mixing them would inflate the score.
- The v1 `composite` column is filled with `accuracy` for continuity. The UI label changes to "Accuracy".

### 9.2 Richness

```
dimension_mean = mean(level / 3) over the four default dimensions
density        = min(1, internal_details / D)                    D = 6
richness       = round(100 × (w_dim × dimension_mean
                              + w_den × density × specificity_ratio), 1)
                                                                 w_dim = 0.6, w_den = 0.4
```

Design intent: generic padding is capped by the dimension levels, and long talk is capped by `D` and discounted by off-topic or habitual content. **These weights are hand-set for v2.** Phase 3 replaces them with weights estimated from data (section 11.4).

### 9.3 Recognition

`H`, `FA` and abstention count per check-in. Pooled d′ in the trend (section 6.2).

### 9.4 Flags

`empty_talk`, `no_bee_facts`, `all_abstained`, `low_asr_confidence` (below `conditions.low_asr_confidence`, default 0.6), `practice`.

---

## 10. Conditions recorded on every check-in

| Field | Rule |
|---|---|
| `lag_days` | `date(recorded_at) − target_date`, in the member's time zone |
| `lag_band` | `same_or_next` 0–1, `week` 2–7, `fortnight` 8–21, `remote` 22+ (config) |
| `practice` | True for the member's first `practice_checkins` non-empty check-ins (default 3) |
| `n_facts_core`, `n_facts_detail` | Bee coverage for the target day |
| `talk_tokens` | Content tokens after filtering |
| `matcher_tier` | `lexical` or `semantic` |
| `input_mode`, `asr_confidence`, hour of day | Context for analysis |

Practice check-ins are scored and shown with a "practice" label. They are **excluded** from the baseline and the trend.

---

## 11. Trend, baseline and reliability

### 11.1 Trend with uncertainty

Trend lines are drawn **per member, per lag band**. A check-in only contributes to the line for its own band. Other bands appear as separate points.

**Accuracy trend.** Use a discounted Beta model on recall and on intrusion. Weights are `w_i = 0.5 ^ (age_i / H)`, where `age_i` is the number of later check-ins and `H = half_life_checkins` (default 7).

```
α_recall = α0 + Σ w_i · Σ(fact scores_i)
β_recall = β0 + Σ w_i · (n_facts_i − Σ(fact scores_i))
α_intr   = α0 + Σ w_i · false_claims_i
β_intr   = β0 + Σ w_i · true_claims_i
draws: recall ~ Beta(α_recall, β_recall), intr ~ Beta(α_intr, β_intr)
accuracy_trend = recall × (1 − 0.5 × intr) × 100
```

Use 2,000 Monte Carlo draws with a fixed seed. Report the median and the 10th and 90th percentiles as the band. Priors until a population prior exists: recall `Beta(2, 2)` (mean 0.5) and intrusion `Beta(1, 9)` (mean 0.1). The intrusion prior has to be small, or a member with no checkable claims would be penalised by the prior alone.

Pooling core and detail facts in one Beta weights the two families by fact count rather than equally, as the per-check-in formula does. This is acceptable for v2; Phase 3 can model the families separately.

**Richness trend.** Exponentially weighted mean with the same half-life. The band is mean ± 1.28 × weighted SD ÷ √n_eff, where `n_eff = (Σw)² / Σw²`.

### 11.2 Baseline and meaningful change

- Baseline = mean of the first `baseline_checkins` (default 5) non-practice check-ins in that lag band. It is **recomputed on every re-score**.
- A change is "real", and safe to drive a nudge, only when the current 80% band does not include the baseline.

### 11.3 Calibration and reliability (before Accuracy or Richness is used as an outcome)

| Check | How | Target |
|---|---|---|
| Scorer vs people: dimension levels | Two people hand-score 40 check-ins; quadratic-weighted κ against the scorer | κw ≥ 0.6 |
| Scorer vs people: fact hits | Same 40 check-ins | κ ≥ 0.7 |
| Semantic thresholds | Choose the threshold that maximises κ against the hand labels | Report the chosen value |
| Internal consistency | Split each check-in's facts odd/even; correlate across check-ins; Spearman–Brown | ≥ 0.7 |
| Test–retest | 20 members re-recall the same target day 1–2 days later; ICC(2,1) | ≥ 0.7 |
| Floor and ceiling | Share of non-practice scores at 0 or 100 | ≤ 15% each |

Consistency is not validity. Phase 3 also correlates Accuracy and Richness with the Flow Short Scale items and with any cognitive mini-tasks.

### 11.4 Data-derived weights (Phase 3)

Once at least 200 members × 10 non-practice check-ins exist, run factor analysis (PCA with a scree check) over the per-check-in measures: core, detail, intrusion, H, FA, four dimension levels, density and specificity ratio. Replace hand-set weights only if the solution is stable across two time splits. Add difficulty-adjusted accuracy with a 1-parameter item model on fact kind × lag band.

---

## 12. Data model, versioning and rollout

### 12.1 Storage

- `checkins`: the immutable inputs in section 2.1, including `bee_snapshot`.
- `score_runs`: one row per (checkin, scorer_version, config_hash). Never updated in place.

```ts
interface ScoreRun {
  checkin_id: string;
  scorer_version: string;          // semver; logic changes bump it
  config_hash: string;             // sha256 of config + pinned library versions
  matcher_tier: "lexical" | "semantic";
  model_id?: string; prompt_version?: string;
  computed_at: string;
  conditions: { lag_days: number; lag_band: string; practice: boolean;
                n_facts_core: number; n_facts_detail: number; talk_tokens: number };
  clauses: { id: number; start: number; end: number; text: string;
             status: "internal" | "external" | "abstained"; external_reason?: string }[];
  facts: { fact_id: string; kind: string; family: "core" | "detail" | null;
           score: 0 | 0.5 | 1; verdict: string; clause_id: number | null;
           evidence: string | null; reason: string }[];
  probes: { probe_id: string; is_lure: boolean; answer: "yes" | "no" | "dont_know";
            outcome: "hit" | "miss" | "false_alarm" | "correct_rejection" | "abstained" }[];
  dimensions: { key: string; level: 0 | 1 | 2 | 3; display: number; hit: boolean;
                clause_id: number | null; evidence: string | null; reason: string }[];
  custom_items: { key: string; display: 0 | 100; evidence: string | null }[];
  details: { internal: number; external: number; abstained: number; specificity_ratio: number };
  metrics: { accuracy: number | null; core: number | null; detail: number | null;
             recall: number | null; intrusion: number; true_claims: number; false_claims: number;
             richness: number | null; dimension_mean: number; density: number;
             H: number | null; FA: number | null };
  flags: string[];
}
```

Every credited item stores its evidence span and a reason. The dashboard's "Why" column reads these.

### 12.2 Re-scoring

- A new `scorer_version` or `config_hash` triggers a batch re-score of all history from the immutable inputs.
- The dashboard reads the latest run. Older runs stay available for side-by-side comparison.
- A re-score must be idempotent: the same inputs, version and config give byte-identical output (seeded randomness only).

### 12.3 Suggested module layout

| Module | Responsibility | Replaces |
|---|---|---|
| `scoring/config.ts` | Load, stem and hash the config | |
| `scoring/segment.ts` | Sentences, clauses, offsets | |
| `scoring/markers.ts` | Abstention, negation, external tags | |
| `scoring/tokens.ts` | Tokenise, stop words, stem | part of `keywords()` |
| `scoring/entities.ts` | compromise NER + known entities | |
| `scoring/facts.ts` | Fact keys (keeps the 8 cap) and matching | `answer-key.ts` key building stays here |
| `scoring/matchers/lexical.ts`, `semantic.ts` | FactMatcher implementations | |
| `scoring/dimensions.ts` | Levels 0–3, custom items | `scoreRubricItem()` in `rubric.ts` |
| `scoring/probes.ts` | Probe and lure selection, outcomes | |
| `scoring/metrics.ts` | Accuracy, richness, recognition, flags | v1 composite |
| `scoring/trend.ts` | Beta and EWMA trend, baseline, bands | |
| `scoring/rescore.ts` | Batch re-score by version | |

### 12.4 Phases

| Phase | Scope | Done when |
|---|---|---|
| **0. Freeze** | Store raw inputs and `bee_snapshot`. Wrap today's logic as `v1.0.0` (8-word cap included). Add `score_runs`. | v1 outputs reproduce exactly from stored inputs |
| **1. v2 lexical** | Sections 4, 5.2, 7, 8, 9 (without probes), 10, 11.1–11.2. Re-score all history. | Section 13 tests pass; dashboard shows Accuracy and Richness with bands |
| **2. Probes + semantic** | Section 6, section 5.3 behind a flag, Phase 2 dimension judge. Calibrate thresholds. | Hand-label study done; κ targets in 11.3 met or reported |
| **3. Validate + learn weights** | Reliability study, Flow Short Scale correlation, factor analysis, difficulty adjustment | Weights published as `scorer_version 3.0.0` |

---

## 13. Acceptance tests (lexical tier)

Shared fixture. **Illustrative Bee facts** for target day 2026-10-05:

| fact_id | kind | text | key (stems) | distinctive |
|---|---|---|---|---|
| f_place | place | Home: flat in Hackney | home, flat, hackney | hackney |
| f_event | event | Dinner with Sam, talked about her new job | dinner, sam, talk, job | dinner, sam, job |
| f_meal | meal | Lamb biryani | lamb, biryani | lamb, biryani |

Known entities: Sam (person, from f_event), Hackney (place, from f_place). Every test is recorded on 2026-10-19, so lag is 14 days (fortnight band), and the member is past their practice check-ins.

### Test A: abstention (the 19 Oct case)

Talk: `I can't remember anything about a friend at home who talked and we agreed`

| Item | Expected | Why |
|---|---|---|
| Clauses | c1 "I can't remember anything about a friend at home who talked" (abstained); c2 "we agreed" (internal) | Rule 4.2.3 splits at "and we" |
| People / Places / Conversations | 0 / 0 / 0 | friend, home and talked are inside the abstained clause |
| Decisions | level 1 (display 33) | "agreed" is a trigger with no object |
| Facts | all 0 | no overlap |
| internal / external / abstained | 1 / 0 / 1 | |
| Accuracy | **0.0** | recall 0, no claims |
| Richness | **11.7** | dimension_mean 1/12, density 1/6, ratio 1 |
| lag_days / lag_band | 14 / fortnight | |

v1 gave this 100 / 100 / 100 / 100 with composite 0.

### Test B: specific and mostly verified

Talk: `Sam came over to my flat. We cooked lamb biryani. She told me about her new job at Monzo, and we agreed to book Lisbon for March. I usually cook on Mondays anyway.`

| Item | Expected | Why |
|---|---|---|
| Clauses | c1 "Sam came over to my flat", c2 "We cooked lamb biryani", c3 "She told me about her new job at Monzo", c4 "we agreed to book Lisbon for March", c5 "I usually cook on Mondays anyway" (external: habitual) | ", and" boundary between c3 and c4 |
| f_place | 0.5 PARTIAL (c1, "flat" is generic) | |
| f_event | 1 MATCH (c1 "sam", c3 "job") | |
| f_meal | 1 MATCH (c2 "lamb", "biryani") | |
| People | 3 | Sam is a person entity (specific) + c1 matches f_event |
| Places | 3 | "my flat" (specific) + c1 matches f_place 0.5 and f_event |
| Conversations | 3 | "told" + job, monzo (specific) + c3 matches f_event |
| Decisions | 2 | "agreed" + book, lisbon, march (specific); no Bee fact to verify. Unverifiable is not wrong. |
| internal / external | 4 / 1 | ratio 0.8 |
| Accuracy | **87.5** | core (0.5 + 1)/2 = 0.75, detail 1, recall 0.875, intrusion 0 |
| Richness | **76.3** | dimension_mean 11/12, density 4/6, ratio 0.8 |

### Test C: guessing caught by a lure

Talk: `We stayed in and had dinner.`
Probes: P1 true (f_place "Were you at home that evening?") → yes; P2 true (f_meal "Did you have lamb biryani?") → no; P3 lure (meal "sushi", from 2026-09-21) → yes.

| Item | Expected | Why |
|---|---|---|
| Clauses | one clause; "and had" is not split (no subject pronoun) | |
| f_event | 1 ("dinner" is distinctive) | |
| f_place, f_meal | 0, 0 | |
| Dimensions | all 0 | no triggers, no entities |
| H / FA | 0.5 / 1.0 | 1 of 2 true probes, 1 of 1 lure |
| Claims | true 2 (f_event, P1 yes), false 1 (lure yes) | intrusion 1/3 |
| Accuracy | **20.8** | core (0 + 1)/2 = 0.5, detail 0, recall 0.25; × (1 − 0.5 × 1/3) |
| Richness | **6.7** | dimension_mean 0, density 1/6, ratio 1 |

With the semantic tier, P2's answer "no, it was pizza" would add a CONTRADICTS claim. The false claims become 2 and the true claims 2, giving intrusion 0.5 and Accuracy 18.8.

### Edge-case tests

1. Empty talk → every metric null, flag `empty_talk`.
2. No Bee facts → `accuracy = null`, richness computed, flag `no_bee_facts`.
3. Only core facts exist → recall = core (detail skipped, not counted as 0).
4. Negation: "We didn't talk about work" → Conversations 0 for that clause.
5. Repetition: the same clause twice → the second is external (Jaccard ≥ 0.8).
6. Lowercase ASR "sam came round" → People 2 or higher via known entities.
7. "Sam and I went out" → one clause (left side has fewer than 3 tokens).
8. A lure that shares a key stem with a target-day fact above the similarity limit is rejected.
9. Re-scoring the same inputs, version and config twice gives identical JSON.
10. A config change produces a new `config_hash` and new score runs; old runs are untouched.
11. Practice: a member's first 3 non-empty check-ins have `practice = true` and are absent from trend and baseline.
12. A custom item added today does not score check-ins recorded before today.

---

## 14. Decision log

Change `Proposed` to `Locked` as each rule is agreed. Open questions are listed last.

| # | Rule | Status | Note |
|---|---|---|---|
| 1 | Read the whole talk; the 8-word cap only applies to building Bee fact keys | Proposed | Was option 1 |
| 2 | Store raw inputs + `bee_snapshot`; version every score run; re-score history | Proposed | Replaces freezing the baseline |
| 3 | Two headline numbers, Accuracy and Richness; no blended score in v2 | Proposed | |
| 4 | Accuracy keeps the v1 formula shape; `composite` column = accuracy | Proposed | Keeps continuity |
| 5 | Dimensions graded 0–3 (generic, specific, verified); display 0/33/67/100 | Proposed | Replaces 0/100 |
| 6 | Abstention and negation detected per clause | Proposed | |
| 7 | Fact partial credit 0.5 for generic-only matches | Proposed | |
| 8 | Intrusion = false claims ÷ all claims; lures and contradictions only | Proposed | Unverifiable ≠ wrong |
| 9 | Recall delay recorded; trend lines per lag band | Proposed | |
| 10 | First 3 check-ins are practice | Proposed | |
| 11 | Trend shown as median + 80% band; nudge only when the band excludes the baseline | Proposed | |
| 12 | Minimum token length 3 (was 4) | Proposed | Keeps pub, mum, ate |
| Q1 | Should generic + verified (level 2) rank equal to specific + unverified (level 2)? | Open | |
| Q2 | How many lures per check-in: 1, or 1 every other check-in? | Open | Balances burden against signal |
| Q3 | Richness weights 0.6 / 0.4 and D = 6 | Open | Hand-set until Phase 3 |
| Q4 | Show members the true fact after probes? | Open | Product choice; affects re-test |

---

## References

- Adolphe, Sawayama, Maurel, Delmas, Oudeyer and Sauzéon (2022). An open-source cognitive test battery to assess human attention and memory. *Frontiers in Psychology*. Code: github.com/flowersteam/cognitive-testbattery
- van Genugten and Schacter (2024). Automated scoring of the Autobiographical Interview with natural language processing. *Behavior Research Methods*. Model: huggingface.co/vangenugtenr/autobiographical_interview_scoring
- Levine et al. (2002). Aging and autobiographical memory: dissociating episodic from semantic retrieval. *Psychology and Aging* (internal vs external details).
- Autorubric (2026). A unified framework for rubric-based LLM evaluation. arXiv:2603.00077
- Hautus (1995). Corrections for extreme proportions and their biasing effects on estimated values of d′. *Behavior Research Methods, Instruments, and Computers*.
