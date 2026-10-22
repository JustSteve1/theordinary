import { writeBaselineSnapshots } from "@/src/platform/baseline/snapshot";
import { requireCron } from "@/src/platform/warehouse/cron";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Called by the Warehouse workflow after the Chronos-2 job and the forecast
 * assertions pass. Copies each member's newest forecast run from BigQuery into
 * Neon so Home can draw the baseline band without reading the warehouse.
 */
export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) {
    return denied;
  }
  const result = await writeBaselineSnapshots();
  return Response.json(result);
}
