import { readFileSync } from "node:fs";

import { loadLocalEnv } from "./load-env";
import {
  assertActivatablePath,
  assertStartAllowed,
  experimentEnvironment,
  experimentFilePath,
  experimentSchemaVersion,
  missingFeatures,
  monitoringFeatureIds,
  parseActivateArgs,
  parseStartDate,
  parsedOrThrow,
  v1FeatureIds,
} from "@/src/platform/experiments/activate";
import { configHash } from "@/src/platform/experiments/config";
import { saveDraft } from "@/src/platform/experiments/store";
import { db, ready } from "@/src/platform/db";
import { warehouse, warehouseEnabled } from "@/src/platform/warehouse/client";
import { memberKey } from "@/src/platform/warehouse/member-key";

async function main() {
  loadLocalEnv();

  const { id, enrolMe, start } = parseActivateArgs(process.argv.slice(2));
  if (!id) {
    console.error("Usage: pnpm experiments:activate <id> [--enrol-me] [--start YYYY-MM-DD]");
    process.exit(1);
  }

  const filePath = experimentFilePath(id);
  assertActivatablePath(filePath);

  const raw = JSON.parse(readFileSync(filePath, "utf8")) as { status?: string };
  if (raw.status && raw.status !== "draft") {
    console.error("Only a draft can be activated. A changed config needs a new version.");
    process.exit(1);
  }
  const parsed = parsedOrThrow(raw);
  const environment = experimentEnvironment(parsed.config);
  const schemaVersion = experimentSchemaVersion(parsed.config);
  assertStartAllowed(environment, start);
  const studyStart = start ? parseStartDate(start) : undefined;
  if (enrolMe && !studyStart) {
    console.error("--enrol-me needs --start YYYY-MM-DD.");
    process.exit(1);
  }
  if ((enrolMe || studyStart) && environment !== "test") {
    console.error("--enrol-me and --start are only allowed for test experiments.");
    process.exit(1);
  }

  const featureIds =
    parsed.kind === "monitoring" ? monitoringFeatureIds(parsed.config) : v1FeatureIds(parsed.config);
  if (!warehouseEnabled()) {
    console.error("Feature registry is not reachable. Impersonate ordinary-dataform and set the warehouse env vars.");
    process.exit(1);
  }
  const bq = await warehouse();
  const [found] = await bq.query({
    location: "europe-west2",
    query: `select feature_id from \`the-ordinary-512212.ordinary_features.feature_registry\`
           where feature_id in unnest(@ids)`,
    params: { ids: featureIds },
  });
  const present = new Set((found as { feature_id: string }[]).map((row) => row.feature_id));
  const missing = missingFeatures(featureIds, present);
  if (missing.length) {
    console.error(`Missing from feature_registry: ${missing.join(", ")}`);
    process.exit(1);
  }

  const email = process.env.USER1_EMAIL;
  if (!email) {
    console.error("Set USER1_EMAIL so the draft can enrol you.");
    process.exit(1);
  }
  await ready();
  const members = await db()`select id::text as id from members where email = ${email} limit 1`;
  const userId = members[0] ? String(members[0].id) : "";
  if (!userId) {
    console.error("No member matches USER1_EMAIL.");
    process.exit(1);
  }

  if (parsed.kind === "v1") {
    const [coverage] = await bq.query({
      location: "europe-west2",
      query: `select countif(value is not null) as n
           from \`the-ordinary-512212.ordinary_features.features_daily\`
           where member_key = @member_key and feature_id = @feature_id`,
      params: { member_key: memberKey(userId), feature_id: parsed.config.primary_outcome.feature_id },
    });
    const days = Number((coverage as { n: number }[])[0]?.n ?? 0);
    if (days < 14) {
      console.error(`Primary outcome has ${days} non-null days. Activation needs at least 14.`);
      process.exit(1);
    }
  }

  await saveDraft(parsed.config);
  const updated = await db()`
    update experiments
    set status = 'active',
        activated_at = now(),
        config_hash = ${configHash(parsed.config)},
        schema_version = ${schemaVersion},
        environment = ${environment}
    where id = ${parsed.config.id} and version = ${parsed.config.version} and status = 'draft'
    returning id
  `;
  if (!updated[0]) {
    console.error("No draft row was updated. Leave active experiments unchanged and add a new version.");
    process.exit(1);
  }

  const shouldEnrol = parsed.kind === "v1" || enrolMe;
  if (shouldEnrol) {
    await db()`
      insert into experiment_enrolments (experiment_id, version, user_id, study_start)
      values (${parsed.config.id}, ${parsed.config.version}, ${userId}, ${studyStart ?? null})
      on conflict (experiment_id, version, user_id) do update
      set left_at = null,
          study_start = coalesce(excluded.study_start, experiment_enrolments.study_start)
    `;
  }
  console.log(`Activated ${parsed.config.id} version ${parsed.config.version}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Activation failed.");
  process.exit(1);
});
