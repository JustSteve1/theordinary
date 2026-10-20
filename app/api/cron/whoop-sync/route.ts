import { consentedWhoopMembers, syncMember } from "@/src/platform/integrations/whoop-sync";
import { requireCron } from "@/src/platform/warehouse/cron";
import { memberKey } from "@/src/platform/warehouse/member-key";
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
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  await ensureTables();
  const members = await consentedWhoopMembers();
  const results = [];
  for (const userId of members) {
    try {
      const counts = await syncMember(userId, {
        start: start.toISOString(),
        end: end.toISOString(),
        source: days > 3 ? "backfill" : "daily",
      });
      results.push({ member_key: memberKey(userId), ...counts });
    } catch (error) {
      results.push({
        member_key: safeKey(userId),
        error: error instanceof Error ? error.message : "WHOOP sync failed.",
      });
    }
  }
  return Response.json({ days, results });
}

function safeKey(userId: string) {
  try {
    return memberKey(userId);
  } catch {
    return "unkeyed";
  }
}
