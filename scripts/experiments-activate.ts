import { readFileSync } from "node:fs";

import { loadLocalEnv } from "./load-env";
import { configHash, validateExperiment } from "@/src/platform/experiments/config";
import { saveDraft } from "@/src/platform/experiments/store";
import { db, ready } from "@/src/platform/db";
import { warehouse, warehouseEnabled } from "@/src/platform/warehouse/client";
import { memberKey } from "@/src/platform/warehouse/member-key";

async function main() {
  loadLocalEnv();

const id = process.argv[2];
if (!id) {
  console.error("Usage: pnpm experiments:activate <id>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(`experiments/${id}.json`, "utf8")) as { status?: string };
if (raw.status && raw.status !== "draft") {
  console.error("Only a draft can be activated. A changed config needs a new version.");
  process.exit(1);
}
const parsed = validateExperiment(raw);
if (!parsed.ok) {
  console.error(`Refusing to activate ${id}: ${parsed.errors.join(", ")}`);
  process.exit(1);
}
const config = parsed.config;
if (!warehouseEnabled()) {
  console.error("Feature registry is not reachable. Impersonate ordinary-dataform and set the warehouse env vars.");
  process.exit(1);
}

const featureIds = [
  config.primary_outcome.feature_id,
  ...config.secondary_outcomes.map((item) => item.feature_id),
];
const bq = await warehouse();
const [found] = await bq.query({
  location: "europe-west2",
  query: `select feature_id from \`the-ordinary-512212.ordinary_features.feature_registry\`
           where feature_id in unnest(@ids)`,
  params: { ids: featureIds },
});
const present = new Set((found as { feature_id: string }[]).map((row) => row.feature_id));
const missing = featureIds.filter((featureId) => !present.has(featureId));
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
const [coverage] = await bq.query({
  location: "europe-west2",
  query: `select countif(value is not null) as n
           from \`the-ordinary-512212.ordinary_features.features_daily\`
           where member_key = @member_key and feature_id = @feature_id`,
  params: { member_key: memberKey(userId), feature_id: config.primary_outcome.feature_id },
});
const days = Number((coverage as { n: number }[])[0]?.n ?? 0);
if (days < 14) {
  console.error(`Primary outcome has ${days} non-null days. Activation needs at least 14.`);
  process.exit(1);
}

await saveDraft(config);
const updated = await db()`
  update experiments
  set status = 'active', activated_at = now(), config_hash = ${configHash(config)}
  where id = ${config.id} and version = ${config.version} and status = 'draft'
  returning id
`;
if (!updated[0]) {
  console.error("No draft row was updated. Leave active experiments unchanged and add a new version.");
  process.exit(1);
}
await db()`
  insert into experiment_enrolments (experiment_id, version, user_id)
  values (${config.id}, ${config.version}, ${userId})
  on conflict (experiment_id, version, user_id) do update
  set left_at = null
`;
console.log(`Activated ${config.id} version ${config.version}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Activation failed.");
  process.exit(1);
});
