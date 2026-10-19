import { randomUUID } from "crypto";

import { db, ready } from "@/src/platform/db";
import type { AnswerFact } from "@/src/platform/recall/answer-key";
import type { RubricItem } from "@/src/platform/recall/rubric";
import { rescore } from "@/src/platform/scoring/rescore";
import type { BeeFact, ScoreProbe, ScoreResult } from "@/src/platform/scoring/types";
import { V1_VERSION, type V1Result } from "@/src/platform/scoring/v1";

export type StoredCheckin = {
  id: string;
  recordedAt: string;
  targetDate: string | null;
  talkText: string;
  probes: ScoreProbe[];
  beeFacts: BeeFact[];
  v1Facts: AnswerFact[];
  rubric: RubricItem[];
  priorNonEmpty: number;
};

export async function insertCheckin(
  userId: string,
  checkin: StoredCheckin,
) {
  await ready();
  await db()`
    insert into checkins (
      id, user_id, session_id, recorded_at, target_date, talk_text, input_mode,
      probes, bee_snapshot, v1_facts, rubric_snapshot, prior_non_empty
    )
    values (
      ${checkin.id},
      ${userId},
      ${checkin.id},
      ${checkin.recordedAt},
      ${checkin.targetDate},
      ${checkin.talkText},
      ${"voice"},
      ${db().json(checkin.probes)},
      ${db().json(checkin.beeFacts)},
      ${db().json(checkin.v1Facts)},
      ${db().json(checkin.rubric)},
      ${checkin.priorNonEmpty}
    )
    on conflict (id) do nothing
  `;
}

export async function insertScoreRun(input: {
  checkinId: string;
  scorerVersion: string;
  configHash: string;
  matcherTier: string;
  payload: V1Result | ScoreResult;
}) {
  await ready();
  await db()`
    insert into score_runs (
      id, checkin_id, scorer_version, config_hash, matcher_tier, payload
    )
    values (
      ${randomUUID()},
      ${input.checkinId},
      ${input.scorerVersion},
      ${input.configHash},
      ${input.matcherTier},
      ${db().json(input.payload)}
    )
    on conflict (checkin_id, scorer_version, config_hash) do nothing
  `;
}

export type DashboardScore = {
  accuracy: number | null;
  richness: number | null;
  practice: boolean;
  lagBand: string | null;
  recognitionHit: number | null;
  recognitionFalseAlarm: number | null;
  dimensions: {
    id: string;
    label: string;
    display: number;
    evidence: string | null;
    reason: string;
  }[];
  custom: { id: string; label: string; score: number }[];
};

export async function ensureScoreRuns(userId: string) {
  const checkins = await listFrozenCheckins(userId);
  for (const checkin of checkins) {
    const frozen = {
      id: checkin.id,
      recordedAt: checkin.recordedAt,
      targetDate: checkin.targetDate,
      talkText: checkin.talkText,
      beeFacts: checkin.beeFacts,
      probes: checkin.probes,
      customItems: checkin.rubric.filter((item) => item.id.startsWith("custom-")),
      priorNonEmpty: checkin.priorNonEmpty,
      v1Facts: checkin.v1Facts,
      v1Rubric: checkin.rubric,
    };
    const v1 = rescore(frozen, V1_VERSION);
    const v2 = rescore(frozen, "2.0.0");
    if (v1.scorerVersion === V1_VERSION) {
      await insertScoreRun({
        checkinId: checkin.id,
        scorerVersion: v1.scorerVersion,
        configHash: v1.configHash,
        matcherTier: v1.matcherTier,
        payload: v1,
      });
    }
    if ("metrics" in v2 && "flags" in v2) {
      await insertScoreRun({
        checkinId: checkin.id,
        scorerVersion: v2.scorerVersion,
        configHash: v2.configHash,
        matcherTier: v2.matcherTier,
        payload: v2,
      });
    }
  }
}

export async function latestDashboardScore(userId: string): Promise<DashboardScore | null> {
  await ensureScoreRuns(userId);
  const rows = await db()`
    select r.payload
    from score_runs r
    join checkins c on c.id = r.checkin_id
    where c.user_id = ${userId}
      and r.scorer_version = '2.0.0'
    order by c.recorded_at desc, r.computed_at desc
    limit 1
  `;
  return rows[0] ? dashboardScore(rows[0].payload) : null;
}

export type TrendRow = {
  id: string;
  recordedAt: string;
  lagBand: string | null;
  practice: boolean;
  accuracy: number | null;
  richness: number | null;
  intrusion: number | null;
};

export async function listTrendRows(userId: string): Promise<TrendRow[]> {
  await ensureScoreRuns(userId);
  const rows = await db()`
    select distinct on (c.id)
      c.id, c.recorded_at, r.payload
    from score_runs r
    join checkins c on c.id = r.checkin_id
    where c.user_id = ${userId}
      and r.scorer_version = '2.0.0'
    order by c.id, r.computed_at desc
  `;
  return rows
    .map((row) => trendRow(row.id, row.recorded_at, row.payload))
    .filter((row): row is TrendRow => row !== null)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export async function listFrozenCheckins(userId: string): Promise<StoredCheckin[]> {
  await ready();
  const rows = await db()`
    select
      id, recorded_at, target_date, talk_text, probes, bee_snapshot,
      v1_facts, rubric_snapshot, prior_non_empty
    from checkins
    where user_id = ${userId}
    order by recorded_at asc
  `;
  return rows.map((row) => ({
    id: String(row.id),
    recordedAt: new Date(row.recorded_at as string | Date).toISOString(),
    targetDate: dateText(row.target_date),
    talkText: String(row.talk_text ?? ""),
    probes: Array.isArray(row.probes) ? (row.probes as ScoreProbe[]) : [],
    beeFacts: Array.isArray(row.bee_snapshot) ? (row.bee_snapshot as BeeFact[]) : [],
    v1Facts: Array.isArray(row.v1_facts) ? (row.v1_facts as AnswerFact[]) : [],
    rubric: Array.isArray(row.rubric_snapshot) ? (row.rubric_snapshot as RubricItem[]) : [],
    priorNonEmpty: Number(row.prior_non_empty ?? 0),
  }));
}

function dashboardScore(value: unknown): DashboardScore | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const payload = value as ScoreResult;
  return {
    accuracy: numberOrNull(payload.metrics?.accuracy),
    richness: numberOrNull(payload.metrics?.richness),
    practice: Boolean(payload.flags?.practice),
    lagBand: payload.conditions?.lagBand ?? null,
    recognitionHit: numberOrNull(payload.metrics?.recognitionHit),
    recognitionFalseAlarm: numberOrNull(payload.metrics?.recognitionFalseAlarm),
    dimensions: (payload.dimensions ?? []).map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      display: dimension.display,
      evidence: dimension.evidence,
      reason: dimension.reason,
    })),
    custom: payload.custom ?? [],
  };
}

function trendRow(id: unknown, recorded: unknown, value: unknown): TrendRow | null {
  const score = dashboardScore(value);
  if (!score) {
    return null;
  }
  const payload = value as ScoreResult;
  return {
    id: String(id),
    recordedAt: new Date(recorded as string | Date).toISOString(),
    lagBand: score.lagBand,
    practice: score.practice,
    accuracy: score.accuracy,
    richness: score.richness,
    intrusion: numberOrNull(payload.metrics?.intrusion),
  };
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateText(value: unknown) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}
