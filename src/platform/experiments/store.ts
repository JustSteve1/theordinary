import { randomUUID } from "crypto";

import { db, ready } from "@/src/platform/db";
import { loadWhoop } from "@/src/platform/integrations/whoop";
import { dateKey } from "@/src/platform/recall/dates";
import {
  configHash,
  validateExperiment,
  type Domain,
  type ExperimentConfig,
} from "@/src/platform/experiments/config";
import { hasDecisionAssigner } from "@/src/platform/experiments/protocol/designs";
import type { MonitoringConfig } from "@/src/platform/experiments/protocol/types";
import { planDecision } from "@/src/platform/experiments/plan";

export async function decideToday(now = new Date()) {
  await ready();
  const experiments = await db()`
    select id, version, config
    from experiments
    where status = 'active'
  `;
  const created: string[] = [];
  for (const experiment of experiments) {
    if (!hasDecisionAssigner(experiment.config)) {
      continue;
    }
    const parsed = validateExperiment(experiment.config);
    if (!parsed.ok) {
      continue;
    }
    const enrolments = await db()`
      select e.user_id::text as user_id
      from experiment_enrolments e
      join consents c on c.user_id = e.user_id
      where e.experiment_id = ${experiment.id}
        and e.version = ${experiment.version}
        and e.left_at is null
        and c.health_accepted_at is not null
    `;
    for (const enrolment of enrolments) {
      const id = await decideOne(parsed.config, String(enrolment.user_id), now);
      if (id) created.push(id);
    }
  }
  return created;
}

/**
 * Same loop as decideToday, with the reason nothing happened when the day
 * produced no decisions. Used by the morning cron so a quiet run is explained.
 */
export async function decideTodayReport(now = new Date()) {
  await ready();
  const active = await db()`select id, config from experiments where status = 'active'`;
  const randomised = active.filter(
    (row) => hasDecisionAssigner(row.config) && validateExperiment(row.config).ok,
  );
  if (!active.length) {
    return { created: 0, skipped: true as const, reason: "no active experiments" };
  }
  if (!randomised.length) {
    return {
      created: 0,
      skipped: true as const,
      reason: "active experiments are monitoring only; nothing to randomise",
    };
  }
  const created = await decideToday(now);
  if (!created.length) {
    return {
      created: 0,
      skipped: true as const,
      reason: "no consented member is enrolled in a randomised experiment, or today's decision already exists",
    };
  }
  return { created: created.length, skipped: false as const };
}

export async function decideOne(config: ExperimentConfig, userId: string, now: Date) {
  const decisionDate = dateKey(now.getTime());
  let whoopRecent = true;
  if (config.availability.requires_whoop_yesterday) {
    const whoop = await loadWhoop(userId);
    whoopRecent =
      whoop.status === "ok" &&
      whoop.recent.some((reading) => {
        if (!reading.atMs) return false;
        return now.getTime() - reading.atMs <= 36 * 60 * 60 * 1000;
      });
  }
  const planned = planDecision({ config, userId, decisionDate, whoopRecent });
  return insertDecision(config, userId, decisionDate, planned);
}

async function insertDecision(
  config: ExperimentConfig,
  userId: string,
  decisionDate: string,
  input: {
    available: boolean;
    reason: string | null;
    arm?: string | null;
    probability?: number | null;
    randU?: number | null;
  },
) {
  await ready();
  const id = randomUUID();
  const rows = await db()`
    insert into decision_points (
      id, experiment_id, version, user_id, decision_date, available, unavailable_reason,
      arm, probability, rand_u
    )
    values (
      ${id},
      ${config.id},
      ${config.version},
      ${userId},
      ${decisionDate},
      ${input.available},
      ${input.reason},
      ${input.arm ?? null},
      ${input.probability ?? null},
      ${input.randU ?? null}
    )
    on conflict (experiment_id, version, user_id, decision_date) do nothing
    returning id
  `;
  return rows[0] ? String(rows[0].id) : null;
}

export type TodayDecision = {
  id: string;
  experimentId: string;
  title: string | null;
  domain: Domain | null;
  arm: string;
  instruction: string | null;
  delivered: boolean;
  response: "done" | "skipped" | null;
};

export async function todayDecisions(userId: string, now = new Date()): Promise<TodayDecision[]> {
  await ready();
  const day = dateKey(now.getTime());
  const rows = await db()`
    select d.id::text, d.experiment_id, d.arm, d.available, d.delivered_at, d.response, e.config
    from decision_points d
    join experiments e on e.id = d.experiment_id and e.version = d.version
    where d.user_id = ${userId}
      and d.decision_date = ${day}
      and e.status = 'active'
      and d.available = true
      and d.arm is not null
    order by d.experiment_id
  `;
  return rows.map((row) => {
    const parsed = validateExperiment(row.config);
    const config = parsed.ok ? parsed.config : null;
    const response = row.response === "done" || row.response === "skipped" ? row.response : null;
    return {
      id: String(row.id),
      experimentId: String(row.experiment_id),
      title: config?.title ?? null,
      domain: config?.domain ?? null,
      arm: String(row.arm),
      instruction: config?.arms[1].instruction ?? null,
      delivered: Boolean(row.delivered_at),
      response,
    };
  });
}

export async function todayDecision(userId: string, now = new Date()) {
  const [first] = await todayDecisions(userId, now);
  return first ?? null;
}

export async function markDelivered(decisionId: string) {
  await ready();
  await db()`
    update decision_points
    set delivered_at = coalesce(delivered_at, now()),
        channel = coalesce(channel, 'home')
    where id = ${decisionId}
  `;
}

export async function respond(decisionId: string, userId: string, response: "done" | "skipped") {
  await ready();
  await db()`
    update decision_points
    set response = ${response}, responded_at = now()
    where id = ${decisionId} and user_id = ${userId}
  `;
}

export async function saveDraft(config: ExperimentConfig | MonitoringConfig) {
  await ready();
  const schemaVersion = "schema_version" in config ? config.schema_version : 1;
  const environment = "environment" in config ? config.environment : "production";
  await db()`
    insert into experiments (id, version, status, config, config_hash, schema_version, environment)
    values (
      ${config.id},
      ${config.version},
      ${"draft"},
      ${db().json(config)},
      ${configHash(config)},
      ${schemaVersion},
      ${environment}
    )
    on conflict (id, version) do nothing
  `;
}
