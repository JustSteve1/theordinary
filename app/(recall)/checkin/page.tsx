import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BeforeStart } from "@/components/recall/before-start";
import { Panel } from "@/components/recall/ui";
import { requireRecall } from "@/lib/recall/guard";
import { isMockScenario, type MockScenario } from "@/lib/recall/script";
import { loadHomeContext } from "@/lib/recall/status";

export const metadata: Metadata = { title: "Before you start" };

const preview: MockScenario[] = [
  "happy",
  "slow",
  "distress",
  "error_connection",
  "error_mic",
  "error_skill",
];

export default async function CheckinPage() {
  const profile = await requireRecall({ min: "done", max: "done" });
  const { state } = await loadHomeContext(profile);
  if (state !== "ready") {
    redirect("/home");
  }
  const blocked =
    profile.settings.micStatus === "denied" ||
    profile.settings.micStatus === "missing" ||
    profile.settings.micStatus === "skipped";

  return (
    <div>
      <p>
        <Link href="/home" className="inline-flex min-h-12 items-center text-[#0a84ff]">
          Back
        </Link>
      </p>
      <h1 className="mt-2 text-[28px] font-medium tracking-tight">Before you start</h1>
      <Panel className="mt-4">
        <ol className="list-decimal space-y-2 pl-6">
          <li>Find somewhere quiet.</li>
          <li>Talk naturally, there are no wrong answers.</li>
          <li>You can stop at any time.</li>
        </ol>
      </Panel>
      <div className="mt-4">
        {blocked ? (
          <p>
            Recall can’t use your microphone. Allow it for this site in the
            browser’s site settings, then update it in Settings.
          </p>
        ) : (
          <BeforeStart
            scenarios={
              process.env.NODE_ENV === "development"
                ? preview.filter((item) => isMockScenario(item))
                : []
            }
          />
        )}
      </div>
    </div>
  );
}
