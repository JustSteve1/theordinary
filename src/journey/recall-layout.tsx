import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { pauseCapture, turnOffCapture } from "@/src/features/settings/actions";
import { dayCaptureLive } from "@/src/platform/recall/capture";
import { currentProfile } from "@/src/platform/recall/guard";
import { AccountMenu } from "@/src/platform/shell/account-menu";
import { RecordingIndicator } from "@/src/platform/shell/recording-indicator";
import { RecallFrame } from "@/src/platform/shell/ui";

export async function RecallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = (await headers()).get("x-recall-path") ?? "";
  const profile = await currentProfile();
  if (path === "/demo") {
    return (
      <RecallFrame
        homeHref={profile?.step === "done" ? "/home" : "/"}
        wide
        account={profile ? <AccountMenu name={profile.name} /> : undefined}
      >
        {children}
      </RecallFrame>
    );
  }
  if (!profile) {
    redirect("/login");
  }
  if (!profile.emailVerifiedAt) {
    redirect("/signup/verify");
  }

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
            <RecordingIndicator
              label="Day capture on"
              interactive
              pauseCapture={pauseCapture}
              turnOffCapture={turnOffCapture}
            />
          ) : null}
        </>
      }
      account={<AccountMenu name={profile.name} />}
    >
      {children}
    </RecallFrame>
  );
}
