import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { loadLocalEnv } from "./load-env";
import {
  buildForecastBands,
  countBandsBySegment,
  forecastModelFrom,
  type ForecastRow,
} from "@/src/features/demo/bands";
import { assertDemoSnapshotSafe, type DemoSnapshot } from "@/src/features/demo/snapshot";
import { db, ready } from "@/src/platform/db";
import { warehouse, warehouseEnabled } from "@/src/platform/warehouse/client";
import { memberKey } from "@/src/platform/warehouse/member-key";

const DATAFORM = "ordinary-dataform@the-ordinary-512212.iam.gserviceaccount.com";

async function main() {
  loadLocalEnv();
  const id = process.argv[2] ?? "barbara-dry-run";
  const email = process.env.USER1_EMAIL?.trim();
  if (!email) {
    console.error("Set USER1_EMAIL.");
    process.exit(1);
  }
  process.env.BQ_LOCATION = "europe-west2";
  process.env.GCP_PROJECT_ID ||= "the-ordinary-512212";
  process.env.WAREHOUSE_IMPERSONATE ||= DATAFORM;
  if (!warehouseEnabled()) {
    console.error("Warehouse is not configured.");
    process.exit(1);
  }

  await ready();
  const members = await db()`select id::text as id from members where email = ${email} limit 1`;
  const userId = members[0] ? String(members[0].id) : "";
  if (!userId) {
    console.error("No member matches USER1_EMAIL.");
    process.exit(1);
  }
  const key = memberKey(userId);
  const bq = await warehouse();

  const experiment = JSON.parse(readFileSync(`experiments/${id}.json`, "utf8"));
  const concept = JSON.parse(readFileSync("experiments/concepts/spotify-mood-lift.json", "utf8"));

  const [series] = await bq.query({
    location: "europe-west2",
    query: `select date, measure_id, value_number, study_day
            from \`the-ordinary-512212.ordinary_effects.study_frame_long\`
            where experiment_id = @experiment_id
              and member_key = @member_key
              and source = 'ordinary'
            order by date, measure_id`,
    params: { experiment_id: id, member_key: key },
  });
  const [partner] = await bq.query({
    location: "europe-west2",
    query: `select date, measure_id, timepoint_id, value_number, value_category, is_synthetic
            from \`the-ordinary-512212.ordinary_effects.study_frame_long\`
            where experiment_id = @experiment_id
              and member_key = @member_key
              and source = 'partner'
            order by date, measure_id`,
    params: { experiment_id: id, member_key: key },
  });
  const [coverage] = await bq.query({
    location: "europe-west2",
    query: `select daily_rows, daily_filled, daily_fill_rate, partner_rows, partner_filled, daily_measures
            from \`the-ordinary-512212.ordinary_effects.study_coverage\`
            where experiment_id = @experiment_id and member_key = @member_key
            limit 1`,
    params: { experiment_id: id, member_key: key },
  });
  const [proof] = await bq.query({
    location: "europe-west2",
    query: `select experiment_id, beta, p025, p975, status
            from \`the-ordinary-512212.ordinary_effects_test.effect_estimates\`
            where experiment_id in ('A', 'B')`,
  });
  const [associations] = await bq.query({
    location: "europe-west2",
    query: `select feature_id, beta, p10, p90, p025, p975, prob_positive, n_with_outcome, not_causal
            from \`the-ordinary-512212.ordinary_effects.effect_estimates_observational\`
            where not_causal is true
            order by n_with_outcome desc
            limit 6`,
  });
  let forecastRows: ForecastRow[] = [];
  try {
    const [forecasts] = await bq.query({
      location: "europe-west2",
      query: `select run_id, created_at, model_id, model_revision, feature_id, history_segment,
                     history_days, window_start, window_end, target_date, q10, q50, q90, status
              from \`the-ordinary-512212.ordinary_effects.forecasts\`
              where experiment_id = @experiment_id
                and member_key = @member_key
                and run_id = (
                  select run_id
                  from \`the-ordinary-512212.ordinary_effects.forecasts\`
                  where experiment_id = @experiment_id and member_key = @member_key
                  order by created_at desc
                  limit 1
                )
              order by feature_id, target_date`,
      params: { experiment_id: id, member_key: key },
    });
    forecastRows = (forecasts as Record<string, unknown>[]).map(forecastRow);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not found/i.test(message)) {
      throw error;
    }
    console.error("No forecasts table yet. Run pnpm forecast:run first for a baseline band.");
  }

  const payload: DemoSnapshot = {
    experiment,
    concept,
    series: (series as Record<string, unknown>[]).map((row) => ({
      date: dateString(row.date),
      measure_id: String(row.measure_id),
      value_number: numberOrNull(row.value_number),
      study_day: Number(row.study_day ?? 0),
    })),
    partner_points: (partner as Record<string, unknown>[]).map((row) => ({
      date: dateString(row.date),
      measure_id: String(row.measure_id),
      timepoint_id: String(row.timepoint_id),
      value_number: numberOrNull(row.value_number),
      value_category: row.value_category == null ? null : String(row.value_category),
      is_synthetic: Boolean(row.is_synthetic),
    })),
    coverage: coverageRow(coverage[0] as Record<string, unknown> | undefined),
    engine_proof: (proof as Record<string, unknown>[]).map((row) => ({
      experiment_id: String(row.experiment_id),
      beta: numberOrNull(row.beta),
      p025: numberOrNull(row.p025),
      p975: numberOrNull(row.p975),
      status: String(row.status ?? ""),
      true_effect: String(row.experiment_id) === "A" ? 4 : 0,
    })),
    associations: (associations as Record<string, unknown>[]).map((row) => ({
      feature_id: String(row.feature_id),
      beta: numberOrNull(row.beta),
      p10: numberOrNull(row.p10),
      p90: numberOrNull(row.p90),
      p025: numberOrNull(row.p025),
      p975: numberOrNull(row.p975),
      prob_positive: numberOrNull(row.prob_positive),
      n_with_outcome: numberOrNull(row.n_with_outcome),
      not_causal: true as const,
    })),
    generated_at: new Date().toISOString(),
  };
  if (forecastRows.length) {
    payload.forecast_model = forecastModelFrom(forecastRows);
    payload.forecast_bands = buildForecastBands(forecastRows, payload.series);
  }
  assertDemoSnapshotSafe(payload);

  await db()`
    insert into demo_snapshots (id, experiment_id, payload)
    values (${randomUUID()}, ${id}, ${db().json(JSON.parse(JSON.stringify(payload)))})
  `;
  mkdirSync("tmp", { recursive: true });
  writeFileSync("tmp/demo-snapshot.json", `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    JSON.stringify({
      experiment_id: id,
      series: payload.series.length,
      partner_points: payload.partner_points.length,
      engine_proof: payload.engine_proof.length,
      associations: payload.associations.length,
      forecast_bands: countBandsBySegment(payload.forecast_bands ?? []),
      file: "tmp/demo-snapshot.json",
    }),
  );
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

function coverageRow(row: Record<string, unknown> | undefined) {
  return {
    daily_rows: Number(row?.daily_rows ?? 0),
    daily_filled: Number(row?.daily_filled ?? 0),
    daily_fill_rate: numberOrNull(row?.daily_fill_rate),
    partner_rows: Number(row?.partner_rows ?? 0),
    partner_filled: Number(row?.partner_filled ?? 0),
    daily_measures: Array.isArray(row?.daily_measures)
      ? (row?.daily_measures as { measure_id: string; days: number; filled: number }[])
      : [],
  };
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === "object" && "value" in value) {
    const inner = Number((value as { value: unknown }).value);
    return Number.isFinite(inner) ? inner : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Snapshot failed.");
  process.exit(1);
});
