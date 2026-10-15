import type { Metadata } from "next";
import Link from "next/link";

import { TrendChart } from "@/src/features/trend/trend-chart";
import { Panel, sectionLabel } from "@/src/platform/shell/ui";
import { copy } from "@/src/platform/recall/copy";
import { recallDefaults } from "@/src/platform/recall/defaults";
import {
  fixtureSessions,
  isFixtureCount,
  type FixtureCount,
} from "@/src/features/trend/fixtures";
import { requireRecall } from "@/src/platform/recall/guard";
import { listSessions } from "@/src/platform/recall/store";
import { cleanSessions } from "@/src/platform/recall/trend";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>;
}) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const fixtureParam = (await searchParams).fixture;
  const sample = isFixtureCount(fixtureParam)
    ? (Number(fixtureParam) as FixtureCount)
    : null;
  const sessions = sample !== null ? fixtureSessions(sample) : await listSessions(profile.id);
  const points = sessions.filter((session) => !session.aborted && session.composite !== null);
  const cleanCount = cleanSessions(points).length;
  const latest = points.at(-1);

  return (
    <div className="text-stone-400">
      <p className={sectionLabel}>Summary</p>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight text-stone-100">
        Your trend
      </h1>
      <p className="mt-2">{copy.baselineHint}</p>
      {sample !== null ? (
        <p className="mt-3" role="status">
          This is a sample trend with {sample} check-ins.
        </p>
      ) : null}
      <p className="mt-3 flex flex-wrap gap-4 text-[#0a84ff]">
        <Link href="/dashboard">Your check-ins</Link>
        <Link href="/dashboard?fixture=0">Sample: none</Link>
        <Link href="/dashboard?fixture=3">Sample: 3</Link>
        <Link href="/dashboard?fixture=5">Sample: 5</Link>
        <Link href="/dashboard?fixture=12">Sample: 12</Link>
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
              <p className="mb-4">{copy.reviewNotice}</p>
            ) : null}
            {cleanCount < recallDefaults.minBaseline ? (
              <p className="mb-4">
                Building your baseline ({cleanCount} of {recallDefaults.minBaseline})
              </p>
            ) : null}
            <TrendChart sessions={points} />
            <p className="mt-4">{copy.chartExplainer}</p>
          </>
        )}
      </Panel>
    </div>
  );
}
