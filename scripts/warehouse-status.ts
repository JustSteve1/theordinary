import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { loadLocalEnv } from "./load-env";
import { validateExperiment } from "@/src/platform/experiments/config";
import { db, ready } from "@/src/platform/db";
import { isBannedColumn } from "@/src/platform/warehouse/firewall";
import { warehouse, warehouseEnabled } from "@/src/platform/warehouse/client";
import { TABLE_SCHEMAS } from "@/src/platform/warehouse/tables";

async function main() {
  loadLocalEnv();

type Check = { id: string; status: "pass" | "warn" | "fail"; detail: string };
const checks: Check[] = [];

const banned = Object.values(TABLE_SCHEMAS).flatMap((table) =>
  table.columns.filter((column) => isBannedColumn(column.name)).map((column) => column.name),
);
checks.push({
  id: "speech_columns_in_code",
  status: banned.length ? "fail" : "pass",
  detail: banned.length ? banned.join(", ") : "No banned column names in the warehouse schemas.",
});

const draft = JSON.parse(readFileSync("experiments/first-experiment.json", "utf8"));
const parsed = validateExperiment(draft);
checks.push({
  id: "first_experiment_draft",
  status: draft.status === "draft" && !parsed.ok ? "pass" : "fail",
  detail: parsed.ok
    ? "The draft validates. It should still contain TODO until you choose to activate it."
    : "Draft refuses activation while hypothesis or instruction is TODO.",
});

try {
  const accounts = execFileSync("gcloud", ["auth", "list", "--format=value(account)"], {
    encoding: "utf8",
  }).trim();
  if (!accounts) {
    checks.push({
      id: "service_account_keys",
      status: "warn",
      detail: "gcloud is not signed in, so user-managed keys were not listed.",
    });
  } else {
    for (const name of ["ordinary-vercel-writer", "ordinary-dataform"]) {
      const email = `${name}@the-ordinary-512212.iam.gserviceaccount.com`;
      const listed = execFileSync(
        "gcloud",
        ["iam", "service-accounts", "keys", "list", `--iam-account=${email}`, "--format=json"],
        { encoding: "utf8" },
      );
      const keys = JSON.parse(listed) as { keyType?: string }[];
      const userKeys = keys.filter((key) => key.keyType && key.keyType !== "SYSTEM_MANAGED");
      checks.push({
        id: `keys_${name}`,
        status: userKeys.length ? "fail" : "pass",
        detail: userKeys.length ? "A user-managed key exists." : "Only Google-managed keys.",
      });
    }
  }
} catch {
  checks.push({
    id: "service_account_keys",
    status: "warn",
    detail: "Could not list service-account keys.",
  });
}

if (!warehouseEnabled()) {
  checks.push({
    id: "bigquery",
    status: "fail",
    detail: "Not connected. Set BQ_LOCATION=europe-west2, GCP_PROJECT_ID, and Application Default Credentials.",
  });
} else {
  try {
    const bq = await warehouse();
    const [rows] = await bq.query({
      location: "europe-west2",
      query: "select check_id, status, detail from `the-ordinary-512212.ordinary_effects.readiness` order by check_id",
    });
    for (const row of rows as { check_id: string; status: Check["status"]; detail: string }[]) {
      checks.push({ id: row.check_id, status: row.status, detail: row.detail ?? "" });
    }
    if (!rows.length) {
      checks.push({ id: "readiness_view", status: "fail", detail: "ordinary_effects.readiness returned no rows." });
    }
  } catch (error) {
    checks.push({
      id: "readiness_view",
      status: "fail",
      detail: error instanceof Error ? error.message : "Could not read ordinary_effects.readiness.",
    });
  }
}

if (process.env.DATABASE_URL) {
  try {
    await ready();
    const rows = await db()`
      select stream, max(last_success_at) as last_success_at
      from warehouse_sync_state
      where stream in ('whoop', 'app_checkins', 'app_score_runs', 'bee', 'erasure')
      group by stream
    `;
    const active = await db()`select count(*)::int as n from experiments where status = 'active'`;
    checks.push({
      id: "experiments_active",
      status: Number(active[0]?.n ?? 0) === 0 ? "pass" : "fail",
      detail: `${active[0]?.n ?? 0} active experiments.`,
    });
    const cutoff = Date.now() - 26 * 60 * 60 * 1000;
    for (const stream of ["whoop", "app_checkins", "app_score_runs", "bee", "erasure"]) {
      const row = rows.find((item) => item.stream === stream);
      const at = row?.last_success_at ? new Date(row.last_success_at as string | Date).getTime() : 0;
      checks.push({
        id: `cron_${stream}`,
        status: at >= cutoff ? "pass" : "warn",
        detail: at ? new Date(at).toISOString() : "No successful run yet.",
      });
    }
  } catch {
    checks.push({
      id: "neon",
      status: "warn",
      detail: "Could not read sync state.",
    });
  }
} else {
  checks.push({ id: "neon", status: "warn", detail: "DATABASE_URL is not set." });
}

  for (const check of checks) {
    console.log(`${check.status.padEnd(4)}  ${check.id}  ${check.detail}`);
  }
  if (checks.some((check) => check.status === "fail")) {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error("fail  warehouse_status  Could not finish the readiness report.");
  process.exit(1);
});
