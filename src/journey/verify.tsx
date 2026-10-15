import type { Metadata } from "next";

import { Panel, RecallFrame } from "@/src/platform/shell/ui";
import { VerifyPanel } from "@/src/features/account/verify-panel";
import { readPending } from "@/src/platform/recall/cookies";
import { recallDefaults } from "@/src/platform/recall/defaults";
import { getRecallProfile, latestEmailToken } from "@/src/platform/recall/store";

export const metadata: Metadata = { title: "Check your email" };
export const dynamic = "force-dynamic";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const expired = (await searchParams).error === "expired";
  const pending = await readPending();
  const profile = pending ? await getRecallProfile(pending.userId) : null;
  const latest = profile
    ? await latestEmailToken(profile.id, "verify")
    : null;
  const elapsed = latest
    ? Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / 1000)
    : recallDefaults.resendCooldownSeconds;
  const retry = Math.max(0, recallDefaults.resendCooldownSeconds - elapsed);
  const devLink =
    process.env.NODE_ENV !== "production" && latest && !latest.used
      ? `/verify?token=${latest.token}`
      : undefined;

  return (
    <RecallFrame>
      <Panel>
        <h1 className="text-[28px] font-medium tracking-tight">
          {expired ? "This link has expired." : "Check your email"}
        </h1>
        <p className="mt-3">
          {profile
            ? `We've sent a link to ${profile.email}. Open it on this device to carry on.`
            : "We've sent a link. Open it on this device to carry on."}
        </p>
        <p className="mt-2 text-stone-400">If you don’t see it, check spam.</p>
        <VerifyPanel initialRetry={retry} devLink={devLink} />
      </Panel>
    </RecallFrame>
  );
}
