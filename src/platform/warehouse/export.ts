import { isOrdinaryCheckinText } from "@/src/platform/integrations/bee-echo";
import { beeRequest, resolveBeeAccess } from "@/src/platform/integrations/bee";
import { db, ready } from "@/src/platform/db";
import { TIME_ZONE } from "@/src/platform/recall/dates";
import { warehouseEnabled } from "@/src/platform/warehouse/client";
import { loadRows } from "@/src/platform/warehouse/load";
import { memberKey, opaqueId } from "@/src/platform/warehouse/member-key";
import { shouldExportMember } from "@/src/platform/warehouse/privacy";
import { readSync, writeSync } from "@/src/platform/warehouse/sync-state";

type ScorePayload = {
  metrics?: Record<string, unknown>;
  dimensions?: { id?: string; level?: number }[];
  flags?: Record<string, unknown>;
  conditions?: { lagDays?: number | null; lagBand?: string | null; practice?: boolean };
};

export function scoreRunRow(member: string, checkinId: string, row: Record<string, unknown>) {
  const payload = (row.payload ?? {}) as ScorePayload;
  const metrics = payload.metrics ?? {};
  const flags = payload.flags ?? {};
  const conditions = payload.conditions ?? {};
  const level = (id: string) => {
    const found = payload.dimensions?.find((item) => item.id === id);
    return typeof found?.level === "number" ? found.level : null;
  };
  return {
    member_key: member,
    checkin_id: opaqueId("c_", checkinId),
    scorer_version: text(row.scorer_version),
    config_hash: text(row.config_hash),
    matcher_tier: text(row.matcher_tier),
    computed_at: iso(row.computed_at),
    accuracy: num(metrics.accuracy),
    richness: num(metrics.richness),
    recall: num(metrics.recall),
    core: num(metrics.core),
    metric_detail: num(metrics.detail),
    intrusion: num(metrics.intrusion),
    recognition_hit: num(metrics.recognitionHit),
    recognition_false_alarm: num(metrics.recognitionFalseAlarm),
    internal_details: num(metrics.internalDetails),
    external_details: num(metrics.externalDetails),
    abstained: num(metrics.abstained),
    specificity_ratio: num(metrics.specificityRatio),
    dim_people_level: level("people"),
    dim_places_level: level("places"),
    dim_conversations_level: level("conversations"),
    dim_decisions_level: level("decisions"),
    flag_empty_talk: Boolean(flags.emptyTalk),
    flag_no_bee_facts: Boolean(flags.noBeeFacts),
    flag_all_abstained: Boolean(flags.allAbstained),
    flag_low_asr: Boolean(flags.lowAsr),
    flag_practice: Boolean(flags.practice),
    lag_days: num(conditions.lagDays),
    lag_band: text(conditions.lagBand),
    practice: Boolean(conditions.practice),
    ingested_at: new Date().toISOString(),
  };
}

export function beeActivityRow(input: {
  member: string;
  kind: "conversation" | "journal";
  startMs: number;
  endMs: number | null;
  summary: string;
  detail: string;
}) {
  return {
    member_key: input.member,
    item_id: opaqueId("b_", `${input.kind}:${input.startMs}`),
    kind: input.kind,
    start_at: new Date(input.startMs).toISOString(),
    end_at: input.endMs ? new Date(input.endMs).toISOString() : null,
    duration_s:
      input.endMs && input.endMs > input.startMs
        ? Math.round((input.endMs - input.startMs) / 1000)
        : null,
    is_ordinary_echo:
      isOrdinaryCheckinText(input.summary) || isOrdinaryCheckinText(input.detail),
    ingested_at: new Date().toISOString(),
  };
}

export async function exportWarehouse(days = 3) {
  if (!warehouseEnabled()) {
    console.info(JSON.stringify({ warehouse: "skipped", stream: "export" }));
    return { skipped: true, reason: "warehouse env incomplete" };
  }
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const members = await consentedMembers();
  const counts: Record<string, number> = {};
  counts.experiments = await exportExperiments();
  for (const userId of members) {
    const skipped = await readSync("skip", userId);
    if (!shouldExportMember(skipped?.lastError)) {
      continue;
    }
    const flag = await readSync("reexport", userId);
    const full = flag?.lastError === "granted";
    const member = memberKey(userId);
    try {
      counts.app_members = (counts.app_members ?? 0) + (await exportMembers(userId, member));
      counts.app_consents = (counts.app_consents ?? 0) + (await exportConsents(userId, member));
      counts.app_checkins = (counts.app_checkins ?? 0) + (await exportCheckins(userId, member, since, full));
      counts.app_score_runs = (counts.app_score_runs ?? 0) + (await exportScores(userId, member, since, full));
      counts.app_recall_sessions =
        (counts.app_recall_sessions ?? 0) + (await exportSessions(userId, member, since, full));
      const bee = await exportBee(userId, member, since);
      counts.bee_activity = (counts.bee_activity ?? 0) + bee.activity;
      counts.bee_daily = (counts.bee_daily ?? 0) + bee.daily;
      counts.experiment_enrolments =
        (counts.experiment_enrolments ?? 0) + (await exportEnrolments(userId, member));
      counts.decision_points =
        (counts.decision_points ?? 0) + (await exportDecisions(userId, member, since, full));
      counts.app_nudges = (counts.app_nudges ?? 0) + (await exportNudges(userId, member, since, full));
    } catch (error) {
      await writeSync({
        stream: "export",
        scope: userId,
        error: error instanceof Error ? error.message : "Export failed.",
      });
    }
    if (full) {
      await writeSync({
        stream: "reexport",
        scope: userId,
        cursor: new Date().toISOString(),
        error: null,
        success: true,
      });
    }
  }
  await retryErasures();
  return counts;
}

async function consentedMembers() {
  await ready();
  const rows = await db()`
    select user_id::text as id
    from consents
    where health_accepted_at is not null
  `;
  return rows.map((row) => String(row.id));
}

async function exportMembers(userId: string, member: string) {
  const rows = await db()`
    select onboarded_at from members where id = ${userId}
  `;
  const row = rows[0];
  if (!row) {
    return 0;
  }
  await loadRows("ordinary_raw", "app_members", [
    {
      member_key: member,
      time_zone: TIME_ZONE,
      onboarded_at: iso(row.onboarded_at),
      ingested_at: new Date().toISOString(),
    },
  ]);
  await writeSync({ stream: "app_members", scope: userId, success: true, error: null });
  return 1;
}

async function exportConsents(userId: string, member: string) {
  const rows = await db()`
    select health_accepted_at from consents where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row?.health_accepted_at) {
    return 0;
  }
  await loadRows("ordinary_raw", "app_consents", [
    {
      member_key: member,
      health_accepted_at: iso(row.health_accepted_at),
      health_withdrawn: false,
      ingested_at: new Date().toISOString(),
    },
  ]);
  await writeSync({ stream: "app_consents", scope: userId, success: true, error: null });
  return 1;
}

async function exportCheckins(userId: string, member: string, since: string, full: boolean) {
  const cursor = full ? null : (await readSync("app_checkins", userId))?.cursor;
  const from = cursor ?? since;
  const rows = await db()`
    select id::text, session_id::text as session_id, recorded_at, target_date, input_mode,
           asr_confidence, prior_non_empty
    from checkins
    where user_id = ${userId} and recorded_at > ${from}
  `;
  const payload = rows.map((row) => ({
    member_key: member,
    checkin_id: opaqueId("c_", String(row.id)),
    session_id: row.session_id ? opaqueId("s_", String(row.session_id)) : null,
    recorded_at: iso(row.recorded_at),
    target_date: dateOnly(row.target_date),
    input_mode: text(row.input_mode),
    asr_confidence: num(row.asr_confidence),
    prior_non_empty: num(row.prior_non_empty),
    ingested_at: new Date().toISOString(),
  }));
  await loadRows("ordinary_raw", "app_checkins", payload);
  await writeSync({
    stream: "app_checkins",
    scope: userId,
    cursor: new Date().toISOString(),
    success: true,
    error: null,
  });
  return payload.length;
}

async function exportScores(userId: string, member: string, since: string, full: boolean) {
  const cursor = full ? null : (await readSync("app_score_runs", userId))?.cursor;
  const from = cursor ?? since;
  const rows = await db()`
    select c.id::text as checkin_id, r.scorer_version, r.config_hash, r.matcher_tier,
           r.computed_at, r.payload
    from score_runs r
    join checkins c on c.id = r.checkin_id
    where c.user_id = ${userId} and r.computed_at > ${from}
  `;
  const payload = rows.map((row) =>
    scoreRunRow(member, String(row.checkin_id), row as Record<string, unknown>),
  );
  await loadRows("ordinary_raw", "app_score_runs", payload);
  await writeSync({
    stream: "app_score_runs",
    scope: userId,
    cursor: new Date().toISOString(),
    success: true,
    error: null,
  });
  return payload.length;
}

async function exportSessions(userId: string, member: string, since: string, full: boolean) {
  const cursor = full ? null : (await readSync("app_recall_sessions", userId))?.cursor;
  const from = cursor ?? since;
  const rows = await db()`
    select id::text, session_date, recorded_at, aborted, short, practice, duration_ms,
           poor_sleep, unwell_or_alcohol, mood, mood_at
    from recall_sessions
    where user_id = ${userId} and recorded_at > ${from}
  `;
  const payload = rows.map((row) => ({
    member_key: member,
    session_id: opaqueId("s_", String(row.id)),
    session_date: dateOnly(row.session_date),
    recorded_at: iso(row.recorded_at),
    aborted: Boolean(row.aborted),
    short: Boolean(row.short),
    practice: Boolean(row.practice),
    duration_ms: num(row.duration_ms),
    poor_sleep: Boolean(row.poor_sleep),
    unwell_or_alcohol: Boolean(row.unwell_or_alcohol),
    mood: num(row.mood),
    mood_at: row.mood_at ? iso(row.mood_at) : null,
    ingested_at: new Date().toISOString(),
  }));
  await loadRows("ordinary_raw", "app_recall_sessions", payload);
  await writeSync({
    stream: "app_recall_sessions",
    scope: userId,
    cursor: new Date().toISOString(),
    success: true,
    error: null,
  });
  return payload.length;
}

async function exportBee(userId: string, member: string, since: string) {
  const access = await resolveBeeAccess(userId);
  // Bee list routes page with limit and cursor. The CLI documents no start/end
  // filter on GET /v1/conversations, /v1/journals, or /v1/daily. End times are
  // not in the fields this app already reads, so duration_s stays null unless
  // the payload includes end_time. The machine proxy is not a member export.
  if (access.via !== "account" || !access.token) {
    await writeSync({ stream: "bee", scope: userId, cursor: new Date().toISOString(), success: true, error: null });
    return { activity: 0, daily: 0 };
  }
  const cutoff = Date.parse(since);
  const conversations = await pageBee(access.origin, access.token, "/v1/conversations", "conversations", cutoff);
  const journals = await pageBee(access.origin, access.token, "/v1/journals", "journals", cutoff);
  const activity = [
    ...conversations.flatMap((item) => {
      const startMs = ms(item.start_time ?? item.created_at);
      if (startMs === null) return [];
      return [
        beeActivityRow({
          member,
          kind: "conversation",
          startMs,
          endMs: ms(item.end_time),
          summary: text(item.short_summary) ?? text(item.summary) ?? "",
          detail: text(item.summary) ?? "",
        }),
      ];
    }),
    ...journals.flatMap((item) => {
      const startMs = ms(item.created_at ?? item.start_time);
      if (startMs === null) return [];
      return [
        beeActivityRow({
          member,
          kind: "journal",
          startMs,
          endMs: ms(item.end_time),
          summary: text(item.text) ?? "",
          detail: text(item.summary) ?? "",
        }),
      ];
    }),
  ];
  const dailies = await pageBee(access.origin, access.token, "/v1/daily", "daily_summaries", cutoff);
  const dailyRows = dailies.flatMap((item) => {
    const day = beeDailyDay(item);
    if (!day) return [];
    return [
      {
        member_key: member,
        day,
        has_daily_summary: true,
        ingested_at: new Date().toISOString(),
      },
    ];
  });
  await loadRows("ordinary_raw", "bee_activity", activity);
  await loadRows("ordinary_raw", "bee_daily", dailyRows);
  await writeSync({ stream: "bee", scope: userId, cursor: new Date().toISOString(), success: true, error: null });
  return { activity: activity.length, daily: dailyRows.length };
}

async function pageBee(
  origin: string,
  token: string | undefined,
  path: string,
  key: string,
  cutoff: number,
) {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const query = cursor ? `${path}?limit=25&cursor=${encodeURIComponent(cursor)}` : `${path}?limit=25`;
    const result = await beeRequest(origin, query, { token });
    if (result.http < 200 || result.http >= 300 || !result.body || typeof result.body !== "object") {
      break;
    }
    const body = result.body as Record<string, unknown>;
    const batch = Array.isArray(body[key])
      ? (body[key] as Record<string, unknown>[])
      : Array.isArray(body.journals)
        ? (body.journals as Record<string, unknown>[])
        : Array.isArray(body.dailies)
          ? (body.dailies as Record<string, unknown>[])
          : [];
    rows.push(...batch);
    const oldest = batch.reduce((min, item) => {
      const at = ms(item.start_time ?? item.created_at ?? item.date);
      return at === null ? min : Math.min(min, at);
    }, Number.POSITIVE_INFINITY);
    const next = body.next_cursor ?? body.nextCursor;
    cursor = typeof next === "string" && next ? next : null;
    if (!cursor || oldest < cutoff) {
      break;
    }
  }
  return rows.filter((item) => {
    const at = ms(item.start_time ?? item.created_at ?? item.date);
    return at === null || at >= cutoff;
  });
}

export function experimentWarehouseRow(row: Record<string, unknown>) {
  const config = (row.config ?? {}) as Record<string, unknown>;
  const primary = (config.primary_outcome ?? {}) as Record<string, unknown>;
  const secondary = Array.isArray(config.secondary_outcomes) ? config.secondary_outcomes : [];
  const partner = (config.partner ?? {}) as Record<string, unknown>;
  const schedule = (config.schedule ?? {}) as Record<string, unknown>;
  const daily = Array.isArray(schedule.daily_measures)
    ? schedule.daily_measures.filter((item): item is string => typeof item === "string")
    : [];
  const timepoints = Array.isArray(schedule.timepoints)
    ? schedule.timepoints
        .map((item) => {
          const point = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return { id: text(point.id), day: num(point.day) };
        })
        .filter((item) => item.id)
    : [];
  const partnerMeasures = Array.isArray(config.partner_measures)
    ? config.partner_measures.map((item) => {
        const measure = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const categories = Array.isArray(measure.categories)
          ? measure.categories.filter((entry): entry is string => typeof entry === "string")
          : [];
        const refs = Array.isArray(measure.timepoints)
          ? measure.timepoints.filter((entry): entry is string => typeof entry === "string")
          : [];
        return {
          id: text(measure.id),
          type: text(measure.type),
          unit: text(measure.unit),
          categories,
          timepoints: refs,
        };
      })
    : [];
  const outcome = (role: string, value: Record<string, unknown>) => ({
    role,
    feature_id: text(value.feature_id),
    offset_days: num(value.offset_days),
    direction: text(value.direction),
  });
  return {
    experiment_id: text(row.id),
    version: num(row.version),
    status: text(row.status),
    config_hash: text(row.config_hash),
    design: text(config.design),
    domain: text(config.domain),
    schema_version: num(row.schema_version) ?? (typeof config.schema_version === "number" ? config.schema_version : 1),
    environment: text(row.environment) ?? (typeof config.environment === "string" ? config.environment : "production"),
    partner_id: text(partner.id),
    duration_days: num(config.duration_days),
    daily_measures: daily,
    timepoints,
    partner_measures: partnerMeasures,
    treatment_probability: num(config.treatment_probability),
    primary_feature_id: text(primary.feature_id),
    primary_offset_days: num(primary.offset_days),
    primary_direction: text(primary.direction),
    outcomes: [outcome("primary", primary), ...secondary.map((item) => outcome("secondary", item as Record<string, unknown>))],
    activated_at: iso(row.activated_at),
    ended_at: iso(row.ended_at),
    ingested_at: new Date().toISOString(),
  };
}

async function exportExperiments() {
  const rows = await db()`
    select id, version, status, config, config_hash, activated_at, ended_at, schema_version, environment
    from experiments
  `;
  const payload = rows.map((row) => experimentWarehouseRow(row as Record<string, unknown>));
  await loadRows("ordinary_experiments", "experiments", payload);
  return payload.length;
}

async function exportEnrolments(userId: string, member: string) {
  const rows = await db()`
    select experiment_id, version, enrolled_at, left_at, study_start
    from experiment_enrolments
    where user_id = ${userId}
  `;
  const payload = rows.map((row) => ({
    experiment_id: text(row.experiment_id),
    version: num(row.version),
    member_key: member,
    enrolled_at: iso(row.enrolled_at),
    left_at: iso(row.left_at),
    study_start: dateOnly(row.study_start),
    ingested_at: new Date().toISOString(),
  }));
  await loadRows("ordinary_experiments", "experiment_enrolments", payload);
  return payload.length;
}

export function appNudgeRow(row: Record<string, unknown>, member: string) {
  return {
    nudge_id: opaqueId("n_", String(row.id)),
    member_key: member,
    rule_id: text(row.rule_id),
    rule_version: finite(row.rule_version),
    kind: text(row.kind),
    category: text(row.category),
    domain: text(row.domain),
    trigger: text(row.trigger),
    decision: text(row.decision),
    probability: finite(row.probability),
    rand_u: finite(row.rand_u),
    message_key: text(row.message_key),
    priority: finite(row.priority),
    created_at: iso(row.created_at),
    expires_at: iso(row.expires_at),
    status: text(row.status),
    shown_at: iso(row.shown_at),
    dismissed_at: iso(row.dismissed_at),
    helpful: row.helpful === true || row.helpful === false ? row.helpful : null,
    channel: text(row.channel) ?? "in_app",
    ingested_at: new Date().toISOString(),
  };
}

export function nudgeExportEligible(input: { healthAccepted: boolean; skipError?: string | null }) {
  return input.healthAccepted && shouldExportMember(input.skipError);
}

async function exportNudges(userId: string, member: string, since: string, full: boolean) {
  const cursor = full ? null : (await readSync("app_nudges", userId))?.cursor;
  const from = cursor ?? since;
  const rows = await db()`
    select id::text, rule_id, rule_version, kind, category, domain, trigger, decision,
           probability, rand_u, message_key, priority, created_at, expires_at,
           status, shown_at, dismissed_at, helpful, channel
    from nudges
    where user_id = ${userId}
      and greatest(
        created_at,
        coalesce(shown_at, created_at),
        coalesce(dismissed_at, created_at)
      ) > ${from}
  `;
  const payload = rows.map((row) => appNudgeRow(row, member));
  await loadRows("ordinary_raw", "app_nudges", payload);
  await writeSync({
    stream: "app_nudges",
    scope: userId,
    cursor: new Date().toISOString(),
    success: true,
    error: null,
  });
  return payload.length;
}

async function exportDecisions(userId: string, member: string, since: string, full: boolean) {
  const cursor = full ? null : (await readSync("decision_points", userId))?.cursor;
  const from = cursor ?? since;
  const rows = await db()`
    select id::text, experiment_id, version, decision_date, decided_at, available,
           unavailable_reason, arm, probability, rand_u, delivered_at, channel, response, responded_at
    from decision_points
    where user_id = ${userId} and decided_at > ${from}
  `;
  const payload = rows.map((row) => ({
    decision_id: opaqueId("b_", String(row.id)),
    experiment_id: text(row.experiment_id),
    version: num(row.version),
    member_key: member,
    decision_date: dateOnly(row.decision_date),
    decided_at: iso(row.decided_at),
    available: Boolean(row.available),
    unavailable_reason: text(row.unavailable_reason),
    arm: text(row.arm),
    probability: num(row.probability),
    rand_u: num(row.rand_u),
    delivered_at: iso(row.delivered_at),
    channel: text(row.channel),
    response: text(row.response),
    responded_at: iso(row.responded_at),
    ingested_at: new Date().toISOString(),
  }));
  await loadRows("ordinary_experiments", "decision_points", payload);
  await writeSync({
    stream: "decision_points",
    scope: userId,
    cursor: new Date().toISOString(),
    success: true,
    error: null,
  });
  return payload.length;
}

async function retryErasures() {
  await ready();
  const rows = await db()`
    select scope from warehouse_sync_state
    where stream = 'erasure' and last_error is not null
  `;
  const { eraseMemberSafely } = await import("@/src/platform/warehouse/privacy");
  for (const row of rows) {
    await eraseMemberSafely(String(row.scope));
  }
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finite(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function iso(value: unknown) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateOnly(value: unknown) {
  const stamped = iso(value);
  return stamped ? stamped.slice(0, 10) : null;
}

// Bee daily summaries carry date_time and created_at as millisecond numbers.
// The day is the London date, which is the day the summary describes.
export function beeDailyDay(item: Record<string, unknown>) {
  const at = ms(item.date_time ?? item.date ?? item.created_at);
  if (at === null) {
    return null;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}

function ms(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
