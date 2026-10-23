import { deliverPlainEmail } from "@/src/platform/mail";
import { requireCron } from "@/src/platform/warehouse/cron";
import {
  loadMorningSnapshot,
  morningReport,
  morningReportRecipients,
} from "@/src/platform/warehouse/morning-report";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) {
    return denied;
  }
  const report = morningReport(await loadMorningSnapshot());
  const recipients = await morningReportRecipients();
  if (recipients.length === 0) {
    return Response.json({ skipped: true, reason: "no member with health consent" });
  }
  let sent = 0;
  for (const to of recipients) {
    const result = await deliverPlainEmail({ to, subject: report.subject, text: report.text });
    if (!result.ok && result.reason === "unconfigured") {
      return Response.json({
        skipped: true,
        reason: "RESEND_API_KEY or EMAIL_FROM is missing",
      });
    }
    if (!result.ok) {
      return Response.json({ error: "Morning report mail failed." }, { status: 502 });
    }
    sent += 1;
  }
  return Response.json({ sent });
}
