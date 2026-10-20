import { loadLocalEnv } from "./load-env";
import { warehouseEnabled } from "@/src/platform/warehouse/client";
import { ensureTables } from "@/src/platform/warehouse/tables";

async function main() {
  loadLocalEnv();
  const created = await ensureTables();
  if (!warehouseEnabled()) {
    console.log("Warehouse is not configured. Set BQ_LOCATION=europe-west2 and GCP_PROJECT_ID.");
    return;
  }
  console.log(created.length ? created.join("\n") : "Raw and experiment tables are already present.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not ensure tables.");
  process.exit(1);
});
