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
import { loadConfig } from "@/src/platform/scoring/config";
import { listTrendRows } from "@/src/platform/scoring/persist";
import { trendBands } from "@/src/platform/scoring/trend";

export async function TrendPanel({
  profileId,
  fixture,
}: {
  profileId: string;
  fixture?: string;
}) {
  const sample = isFixtureCount(fixture) ? (Number(fixture) as FixtureCount) : null;
  const sessions = sample !== null ? fixtureSessions(sample) : await listSessions(profileId);
  const points = sessions.filter(
    (session) => !session.aborted && !session.practice && session.composite !== null,
  );
  const bands =
    sample === null ? trendBands(await listTrendRows(profileId), loadConfig()) : [];
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
      {bands.some((band) => band.counted > 0 || band.practice > 0) ? (
        <Panel className="mt-4">
          <h3 className="text-stone-100">Accuracy and richness</h3>
          <p className="mt-2">
            Each gap between the day and the check-in has its own line. The band is the
            middle 80%. Practice check-ins are kept out of it.
          </p>
          <ul className="mt-4 space-y-4">
            {bands
              .filter((band) => band.counted > 0 || band.practice > 0)
              .map((band) => (
                <li key={band.key} className="border-t border-white/10 pt-3">
                  <p className="text-stone-100">{bandLabel(band.key)}</p>
                  {band.accuracy ? (
                    <p className="mt-1">
                      Accuracy {band.accuracy.median.toFixed(1)} (80% band{" "}
                      {band.accuracy.low.toFixed(1)}–{band.accuracy.high.toFixed(1)})
                    </p>
                  ) : (
                    <p className="mt-1">Accuracy is still building for this gap.</p>
                  )}
                  {band.richness ? (
                    <p>
                      Richness {band.richness.mean.toFixed(1)} (80% band{" "}
                      {band.richness.low.toFixed(1)}–{band.richness.high.toFixed(1)})
                    </p>
                  ) : null}
                  {band.practice > 0 ? (
                    <p>
                      {band.practice} practice check-in{band.practice === 1 ? "" : "s"} not
                      included.
                    </p>
                  ) : null}
                  {band.nudge ? <p>This band is outside your usual range.</p> : null}
                </li>
              ))}
          </ul>
        </Panel>
      ) : null}
    </section>
  );
}

function bandLabel(key: string) {
  if (key === "same_or_next") {
    return "Same day or the next day";
  }
  if (key === "week") {
    return "A few days on";
  }
  if (key === "fortnight") {
    return "About a fortnight";
  }
  return "Three weeks or more";
}
