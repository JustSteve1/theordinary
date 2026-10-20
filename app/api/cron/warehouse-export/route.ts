import { requireCron } from "@/src/platform/warehouse/cron";
import { exportWarehouse } from "@/src/platform/warehouse/export";
import { ensureTables } from "@/src/platform/warehouse/tables";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) {
    return denied;
  }
  const requested = Number(new URL(request.url).searchParams.get("days") ?? "3");
  const days = Math.min(30, Math.max(1, Number.isFinite(requested) ? requested : 3));
  await ensureTables();
  const counts = await exportWarehouse(days);
  return Response.json({ days, counts });
}
