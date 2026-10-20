import { loadLocalEnv } from "./load-env";
import { db, ready } from "@/src/platform/db";
import { syncMember } from "@/src/platform/integrations/whoop-sync";
import { exportWarehouse } from "@/src/platform/warehouse/export";
import { ensureTables } from "@/src/platform/warehouse/tables";

const WRITER = "ordinary-vercel-writer@the-ordinary-512212.iam.gserviceaccount.com";

async function main() {
  loadLocalEnv();
  if (process.env.WAREHOUSE_LAND !== "prod") {
    console.error(
      "Refusing to write ordinary_raw. Set WAREHOUSE_LAND=prod, or run kedro with --env=prod --pipelines=land_user1.",
    );
    process.exit(2);
  }
  const secret = process.env.MEMBER_KEY_SECRET ?? "";
  if (secret.length < 32) {
    console.error("MEMBER_KEY_SECRET must be at least 32 characters and is not set.");
    process.exit(1);
  }
  const requested = Number(process.argv[2] ?? "30");
  const days = Math.min(30, Math.max(1, Number.isFinite(requested) ? requested : 30));
  const email = (process.argv[3] || process.env.USER1_EMAIL || "").trim();
  if (!email) {
    console.error("Set USER1_EMAIL or pass the member email.");
    process.exit(1);
  }
  if ((process.env.BQ_LOCATION ?? "europe-west2") !== "europe-west2") {
    console.error("Warehouse location must be europe-west2.");
    process.exit(1);
  }
  process.env.BQ_LOCATION = "europe-west2";
  process.env.GCP_PROJECT_ID ||= "the-ordinary-512212";
  process.env.WAREHOUSE_IMPERSONATE ||= WRITER;

  await ready();
  const members = await db()`select id::text as id from members where email = ${email} limit 1`;
  const userId = members[0] ? String(members[0].id) : "";
  if (!userId) {
    console.error("No member matches USER1_EMAIL.");
    process.exit(1);
  }

  await ensureTables();
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const whoop = await syncMember(userId, {
    start: start.toISOString(),
    end: end.toISOString(),
    source: days > 3 ? "backfill" : "daily",
  });
  const counts = await exportWarehouse(days);
  console.log(`LAND_RESULT ${JSON.stringify({ days, whoop, export: counts })}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Landing failed.";
  console.error(message.replace(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+/g, "[redacted-url]"));
  process.exit(1);
});
