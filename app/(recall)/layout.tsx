import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RecordingIndicator } from "@/components/recall/recording-indicator";
import { RecallFrame } from "@/components/recall/ui";
import { currentProfile } from "@/lib/recall/guard";
import { dayCaptureLive } from "@/lib/recall/home-state";

export const dynamic = "force-dynamic";

export default async function RecallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await currentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!profile.emailVerifiedAt) {
    redirect("/signup/verify");
  }

  const path = (await headers()).get("x-recall-path") ?? "";
  const listening = path.startsWith("/checkin/live");
  const capture = dayCaptureLive(profile);

  return (
    <RecallFrame
      homeHref={profile.step === "done" ? "/home" : "/welcome/privacy"}
      indicator={
        <>
          {listening ? (
            <RecordingIndicator label="Listening" interactive={false} />
          ) : null}
          {capture ? (
            <RecordingIndicator label="Day capture on" interactive />
          ) : null}
        </>
      }
      aside={
        profile.step === "done" ? (
          <Link
            href="/settings"
            className="inline-flex min-h-12 items-center text-[#0a84ff]"
          >
            Settings
          </Link>
        ) : null
      }
    >
      {children}
    </RecallFrame>
  );
}
