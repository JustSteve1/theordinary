import { readFileSync } from "node:fs";

import { canViewDemo } from "@/src/features/demo/access";
import type { DemoScore } from "@/src/features/demo/view";
import { assertDemoSnapshotSafe, type DemoSnapshot } from "@/src/features/demo/snapshot";
import { db, ready } from "@/src/platform/db";
import { latestDashboardScore } from "@/src/platform/scoring/persist";

export function hasSnapshotFile() {
  return Boolean(process.env.DEMO_SNAPSHOT_FILE?.trim());
}

export function demoAllowed(input: { email?: string | null; preview: boolean }) {
  return canViewDemo({
    email: input.email,
    preview: input.preview,
    allowlistedEmail: process.env.USER1_EMAIL,
    snapshotFile: hasSnapshotFile(),
  });
}

export async function loadDemoSnapshot(experimentId: string): Promise<DemoSnapshot | null> {
  const file = process.env.DEMO_SNAPSHOT_FILE?.trim();
  if (file) {
    const payload = JSON.parse(readFileSync(file, "utf8")) as DemoSnapshot;
    assertDemoSnapshotSafe(payload);
    return payload;
  }
  await ready();
  const rows = await db()`
    select payload
    from demo_snapshots
    where experiment_id = ${experimentId}
    order by created_at desc
    limit 1
  `;
  if (!rows[0]) {
    return null;
  }
  const payload = rows[0].payload as DemoSnapshot;
  assertDemoSnapshotSafe(payload);
  return payload;
}

export async function loadLiveScore(): Promise<DemoScore | null> {
  const email = process.env.USER1_EMAIL?.trim();
  if (!email) {
    return null;
  }
  await ready();
  const members = await db()`select id::text as id from members where email = ${email} limit 1`;
  const userId = members[0] ? String(members[0].id) : "";
  if (!userId) {
    return null;
  }
  const score = await latestDashboardScore(userId);
  if (!score) {
    return null;
  }
  const times = await db()`
    select c.recorded_at
    from score_runs r
    join checkins c on c.id = r.checkin_id
    where c.user_id = ${userId}
      and r.scorer_version = '2.0.0'
    order by c.recorded_at desc
    limit 1
  `;
  return {
    accuracy: score.accuracy,
    richness: score.richness,
    recordedAt: times[0] ? new Date(times[0].recorded_at as string | Date).toISOString() : null,
    dimensions: score.dimensions.map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      display: dimension.display,
    })),
  };
}
