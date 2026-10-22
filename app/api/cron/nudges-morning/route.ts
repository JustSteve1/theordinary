import { runScheduledNudges } from "@/src/platform/nudges";
import { requireCron } from "@/src/platform/warehouse/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) {
    return denied;
  }
  try {
    const result = await runScheduledNudges(new Date());
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Nudges run failed." },
      { status: 500 },
    );
  }
}
