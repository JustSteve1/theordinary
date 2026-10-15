import Link from "next/link";

import {
  fixtureSessions,
  isFixtureCount,
  TrendChart,
  type FixtureCount,
} from "@/src/features/trend";
import { Panel, sectionLabel } from "@/src/platform/shell/ui";
import { copy } from "@/src/platform/recall/copy";
import { recallDefaults } from "@/src/platform/recall/defaults";
import { listSessions } from "@/src/platform/recall/store";
import { cleanSessions } from "@/src/platform/recall/trend";

export async function TrendPanel({
  profileId,
  fixture,
}: {
  profileId: string;
  fixture?: string;
}) {
  const sample = isFixtureCount(fixture) ? (Number(fixture) as FixtureCount) : null;
  const sessions = sample !== null ? fixtureSessions(sample) : await listSessions(profileId);
  const points = sessions.filter((session) => !session.aborted && session.composite !== null);
  const cleanCount = cleanSessions(points).length;
  const latest = points.at(-1);

  return (
    <section className="text-stone-400">
      <p className={sectionLabel}>Summary</p>
      <h2 className="mt-3 text-[28px] font-medium tracking-tight text-stone-100">
        Your trend
      </h2>
      <p className="mt-2">{copy.baselineHint}</p>
      {sample !== null ? (
        <p className="mt-3" role="status">
          This is a sample trend with {sample} check-ins.
        </p>
      ) : null}
      {cleanCount < recallDefaults.minBaseline ? (
        <p className="mt-3">
          Building your baseline ({cleanCount} of {recallDefaults.minBaseline})
        </p>
      ) : null}
      <p className="mt-3 flex flex-wrap gap-4 text-[#0a84ff]">
        <Link href="/app">Your check-ins</Link>
        <Link href="/app?fixture=0">Sample: none</Link>
        <Link href="/app?fixture=3">Sample: 3</Link>
        <Link href="/app?fixture=5">Sample: 5</Link>
        <Link href="/app?fixture=12">Sample: 12</Link>
      </p>
      <Panel className="mt-4">
        {points.length === 0 ? (
          <p>
            Your first check-in will appear here.{" "}
            <Link href="/home" className="text-[#0a84ff]">
              Home
            </Link>
          </p>
        ) : (
          <>
            {latest?.trend.flag === "review_suggested" ? (
              <p className="mb-4 text-stone-100">{copy.reviewNotice}</p>
            ) : null}
            <TrendChart sessions={points} />
            <p className="mt-4">{copy.chartExplainer}</p>
          </>
        )}
      </Panel>
    </section>
  );
}
