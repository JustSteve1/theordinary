import type { Metadata } from "next";
import Link from "next/link";

import { TrendChart } from "@/components/recall/trend-chart";
import { Panel } from "@/components/recall/ui";
import { copy } from "@/lib/recall/copy";
import { recallDefaults } from "@/lib/recall/defaults";
import {
  fixtureSessions,
  isFixtureCount,
  type FixtureCount,
} from "@/lib/recall/fixtures";
import { requireRecall } from "@/lib/recall/guard";
import { listSessions } from "@/lib/recall/store";
import { cleanSessions } from "@/lib/recall/trend";

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
    <div>
      <h1 className="text-[28px] font-medium tracking-tight">Your trend</h1>
      <p className="mt-2 text-[#d6d3d1]">{copy.baselineHint}</p>
      {sample !== null ? (
        <p className="mt-3" role="status">
          This is a sample trend with {sample} check-ins.
        </p>
      ) : null}
      <p className="mt-3 flex flex-wrap gap-3 text-[#0a84ff]">
        <Link href="/dashboard" className="inline-flex min-h-12 items-center">
          Your check-ins
        </Link>
        <Link href="/dashboard?fixture=0" className="inline-flex min-h-12 items-center">
          Sample: none
        </Link>
        <Link href="/dashboard?fixture=3" className="inline-flex min-h-12 items-center">
          Sample: 3
        </Link>
        <Link href="/dashboard?fixture=5" className="inline-flex min-h-12 items-center">
          Sample: 5
        </Link>
        <Link href="/dashboard?fixture=12" className="inline-flex min-h-12 items-center">
          Sample: 12
        </Link>
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
            <p className="mt-4 text-[#d6d3d1]">{copy.chartExplainer}</p>
          </>
        )}
      </Panel>
    </div>
  );
}
