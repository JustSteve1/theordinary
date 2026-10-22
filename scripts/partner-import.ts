import { readFileSync } from "node:fs";

import { loadLocalEnv } from "./load-env";
import { assertActivatablePath, experimentFilePath } from "@/src/platform/experiments/activate";
import { parsePartnerCsv, partnerImportId, validatePartnerRows } from "@/src/platform/experiments/partner";
import { parseExperiment } from "@/src/platform/experiments/protocol/validate";
import { db, ready } from "@/src/platform/db";
import { warehouse, warehouseEnabled } from "@/src/platform/warehouse/client";
import { loadRows } from "@/src/platform/warehouse/load";
import { memberKey } from "@/src/platform/warehouse/member-key";
import { ensureTables } from "@/src/platform/warehouse/tables";

const WRITER = "ordinary-vercel-writer@the-ordinary-512212.iam.gserviceaccount.com";

async function main() {
  loadLocalEnv();
  const id = process.argv[2];
  const file = process.argv[3];
  const dryRun = process.argv.includes("--dry-run");
  if (!id || !file) {
    console.error("Usage: pnpm partner:import <experiment-id> <file.csv> [--dry-run]");
    process.exit(1);
  }
  const filePath = experimentFilePath(id);
  assertActivatablePath(filePath);
  const parsed = parseExperiment(JSON.parse(readFileSync(filePath, "utf8")));
  if (!parsed.ok || parsed.kind !== "monitoring") {
    console.error("Partner import is only for monitoring experiments.");
    process.exit(1);
  }
  const email = process.env.USER1_EMAIL?.trim().toLowerCase() ?? "";
  if (!email) {
    console.error("Set USER1_EMAIL.");
    process.exit(1);
  }

  process.env.BQ_LOCATION = "europe-west2";
  process.env.GCP_PROJECT_ID ||= "the-ordinary-512212";
  process.env.WAREHOUSE_IMPERSONATE ||= WRITER;
  if (!warehouseEnabled()) {
    console.error("Warehouse is not configured.");
    process.exit(1);
  }

  const content = readFileSync(file, "utf8");
  const importId = partnerImportId(content);
  const csv = parsePartnerCsv(content);
  await ready();
  const members = await db()`select id::text as id from members where email = ${email} limit 1`;
  const userId = members[0] ? String(members[0].id) : "";
  const enrolments = userId
    ? await db()`
        select user_id
        from experiment_enrolments
        where experiment_id = ${parsed.config.id}
          and version = ${parsed.config.version}
          and user_id = ${userId}
          and left_at is null
      `
    : [];
  const alreadyImported = await importExists(importId);
  const result = validatePartnerRows({
    rows: csv.rows,
    config: parsed.config,
    allowlistedEmail: email,
    enrolled: enrolments.length > 0,
    memberKey: userId ? memberKey(userId) : null,
    importId,
    alreadyImported,
  });
  const rejected = [...csv.errors, ...result.rejected];
  console.log(
    JSON.stringify({
      experiment_id: parsed.config.id,
      dry_run: dryRun,
      rows_total: csv.rows.length,
      rows_loaded: dryRun ? 0 : result.accepted.length,
      rows_accepted: result.accepted.length,
      rows_rejected: rejected.length,
      rejections: rejected,
    }),
  );
  if (dryRun || !result.accepted.length) {
    return;
  }
  await ensureTables();
  await loadRows("ordinary_raw", "partner_measures", result.accepted);
}

async function importExists(importId: string) {
  try {
    const bq = await warehouse();
    const [rows] = await bq.query({
      location: "europe-west2",
      query: `select import_id
              from \`the-ordinary-512212.ordinary_raw.partner_measures\`
              where import_id = @import_id
              limit 1`,
      params: { import_id: importId },
    });
    return rows.length > 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (/not found/i.test(message)) {
      return false;
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Import failed.");
  process.exit(1);
});
