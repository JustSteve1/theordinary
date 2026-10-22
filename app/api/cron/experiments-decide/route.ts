import { decideTodayReport } from "@/src/platform/experiments/store";
import { requireCron } from "@/src/platform/warehouse/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) {
    return denied;
  }
  try {
    return Response.json(await decideTodayReport());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Decision run failed." },
      { status: 500 },
    );
  }
}
