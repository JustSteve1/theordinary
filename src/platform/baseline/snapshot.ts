import { randomUUID } from "crypto";

import {
  buildForecastBands,
  forecastModelFrom,
  type ForecastRow,
} from "@/src/features/demo/bands";
import type { DemoForecastBand, DemoForecastModel } from "@/src/features/demo/snapshot";
import { db, ready } from "@/src/platform/db";
import { warehouse, warehouseEnabled, warehouseLocation } from "@/src/platform/warehouse/client";
import { assertNoSpeech } from "@/src/platform/warehouse/firewall";
import { memberKey } from "@/src/platform/warehouse/member-key";

/** The two measures Home draws. Both come from the probe-scored check-in. */
export const HOME_MEASURES = ["recall.accuracy", "recall.richness"] as const;
export const HISTORY_DAYS = 35;

export type BaselinePoint = { date: string; measure_id: string; value_number: number | null };

export type BaselinePayload = {
  model: DemoForecastModel;
  bands: DemoForecastBand[];
  series: BaselinePoint[];
  generated_at: string;
};

export type BaselineSnapshot = BaselinePayload & {
  run_id: string;
  created_at: string;
};

/**
 * Pure: joins one forecast run with the member's recent daily features. Dates are
 * kept as calendar strings so Home never needs BigQuery. Numbers and ids only.
 */
export function buildBaselinePayload(
  forecasts: ForecastRow[],
  features: BaselinePoint[],
  now = new Date(),
): BaselinePayload | null {
  const model = forecastModelFrom(forecasts);
  if (!model) {
    return null;
  }
  const series = features
    .filter((point) => (HOME_MEASURES as readonly string[]).includes(point.measure_id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.measure_id.localeCompare(b.measure_id));
  const bands = buildForecastBands(
    forecasts.filter((row) => (HOME_MEASURES as readonly string[]).includes(row.feature_id)),
    series.map((point) => ({ ...point, study_day: 0 })),
  );
  const payload: BaselinePayload = { model, bands, series, generated_at: now.toISOString() };
  assertNoSpeech("baseline_series", payload.series);
  assertNoSpeech("baseline_bands", payload.bands);
  return payload;
}

export async function latestBaseline(userId: string): Promise<BaselineSnapshot | null> {
  await ready();
  const rows = await db()`
    select run_id, created_at, payload
    from baseline_snapshots
    where user_id = ${userId}
    order by created_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row || !row.payload || typeof row.payload !== "object") {
    return null;
  }
  const payload = row.payload as BaselinePayload;
  return {
    ...payload,
    run_id: String(row.run_id),
    created_at: new Date(row.created_at as string | Date).toISOString(),
  };
}

export type SnapshotResult =
  | { skipped: true; reason: string }
  | { skipped: false; members: number; written: number; errors: string[] };

/**
 * Reads the newest forecast run per consented member from BigQuery and writes a
 * Neon row. Idempotent on (member, run_id), so a re-run after the same forecast
 * changes nothing.
 */
export async function writeBaselineSnapshots(now = new Date()): Promise<SnapshotResult> {
  if (!warehouseEnabled()) {
    return { skipped: true, reason: "warehouse env incomplete" };
  }
  await ready();
  const members = await db()`
    select c.user_id::text as id
    from consents c
    where c.health_accepted_at is not null
  `;
  const bq = await warehouse();
  const project = process.env.GCP_PROJECT_ID ?? "the-ordinary-512212";
  const location = warehouseLocation();
  let written = 0;
  const errors: string[] = [];
  for (const member of members) {
    const userId = String(member.id);
    const key = memberKey(userId);
    try {
      const [forecastRows] = await bq.query({
        location,
        query: `select run_id, created_at, model_id, model_revision, feature_id, history_segment,
                       history_days, window_start, window_end, target_date, q10, q50, q90, status
                from \`${project}.ordinary_effects.forecasts\`
                where member_key = @member_key
                  and run_id = (
                    select run_id from \`${project}.ordinary_effects.forecasts\`
                    where member_key = @member_key
                    order by created_at desc
                    limit 1
                  )
                order by feature_id, target_date`,
        params: { member_key: key },
      });
      const forecasts = (forecastRows as Record<string, unknown>[]).map(forecastRow);
      if (!forecasts.length) {
        continue;
      }
      const [featureRows] = await bq.query({
        location,
        query: `select date, feature_id as measure_id, value as value_number
                from \`${project}.ordinary_features.features_daily\`
                where member_key = @member_key
                  and feature_id in unnest(@measures)
                  and date >= date_sub(current_date('Europe/London'), interval @days day)
                order by date, feature_id`,
        params: { member_key: key, measures: [...HOME_MEASURES], days: HISTORY_DAYS },
      });
      const features = (featureRows as Record<string, unknown>[]).map((row) => ({
        date: dateString(row.date),
        measure_id: String(row.measure_id),
        value_number: numberOrNull(row.value_number),
      }));
      const payload = buildBaselinePayload(forecasts, features, now);
      if (!payload) {
        continue;
      }
      const inserted = await db()`
        insert into baseline_snapshots (id, user_id, run_id, model_id, model_revision, created_at, payload)
        values (
          ${randomUUID()},
          ${userId},
          ${forecasts[0].run_id},
          ${payload.model.model_id},
          ${payload.model.model_revision},
          ${now},
          ${db().json(JSON.parse(JSON.stringify(payload)))}
        )
        on conflict (user_id, run_id) do nothing
        returning id
      `;
      written += inserted.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not found/i.test(message)) {
        return { skipped: true, reason: "forecasts table not found; run the forecast job first" };
      }
      errors.push(`${key.slice(0, 8)}: ${message}`);
    }
  }
  return { skipped: false, members: members.length, written, errors };
}

function forecastRow(row: Record<string, unknown>): ForecastRow {
  return {
    run_id: String(row.run_id),
    created_at: dateTimeString(row.created_at),
    model_id: String(row.model_id),
    model_revision: String(row.model_revision),
    feature_id: String(row.feature_id),
    history_segment: String(row.history_segment),
    history_days: Number(row.history_days ?? 0),
    window_start: dateString(row.window_start),
    window_end: dateString(row.window_end),
    target_date: row.target_date == null ? null : dateString(row.target_date),
    q10: numberOrNull(row.q10),
    q50: numberOrNull(row.q50),
    q90: numberOrNull(row.q90),
    status: String(row.status ?? ""),
  };
}

function dateString(value: unknown) {
  if (value && typeof value === "object" && "value" in value) {
    return String((value as { value: unknown }).value).slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function dateTimeString(value: unknown) {
  if (value && typeof value === "object" && "value" in value) {
    return new Date(String((value as { value: unknown }).value)).toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(String(value)).toISOString();
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === "object" && "value" in value) {
    const inner = Number((value as { value: unknown }).value);
    return Number.isFinite(inner) ? inner : null;
  }
  if (value == null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
