import type {
  DemoForecastBand,
  DemoForecastModel,
  DemoForecastPoint,
  DemoForecastSegment,
  DemoSeriesPoint,
} from "@/src/features/demo/snapshot";

/** One row of `ordinary_effects.forecasts`, already reduced to plain values. */
export type ForecastRow = {
  run_id: string;
  created_at: string;
  model_id: string;
  model_revision: string;
  feature_id: string;
  history_segment: string;
  history_days: number;
  window_start: string;
  window_end: string;
  target_date: string | null;
  q10: number | null;
  q50: number | null;
  q90: number | null;
  status: string;
};

const SEGMENTS: DemoForecastSegment[] = ["full", "limited", "insufficient"];

function toSegment(value: string): DemoForecastSegment {
  return SEGMENTS.includes(value as DemoForecastSegment)
    ? (value as DemoForecastSegment)
    : "insufficient";
}

/**
 * Count the window days where the actual value sits inside [q10, q90], out of
 * the window days that have both a forecast point and an actual value.
 */
export function countInside(
  points: DemoForecastPoint[],
  actual: { date: string; value_number: number | null }[],
): { inside: number | null; compared: number | null } {
  if (!points.length) {
    return { inside: null, compared: null };
  }
  const byDate = new Map<string, number>();
  for (const row of actual) {
    if (row.value_number != null && Number.isFinite(row.value_number)) {
      byDate.set(row.date, row.value_number);
    }
  }
  let inside = 0;
  let compared = 0;
  for (const point of points) {
    const value = byDate.get(point.date);
    if (value == null) {
      continue;
    }
    compared += 1;
    if (value >= Math.min(point.q10, point.q90) && value <= Math.max(point.q10, point.q90)) {
      inside += 1;
    }
  }
  return { inside, compared };
}

export function buildForecastBands(rows: ForecastRow[], series: DemoSeriesPoint[]): DemoForecastBand[] {
  const groups = new Map<string, ForecastRow[]>();
  for (const row of rows) {
    const list = groups.get(row.feature_id) ?? [];
    list.push(row);
    groups.set(row.feature_id, list);
  }
  const bands: DemoForecastBand[] = [];
  for (const [measure_id, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const first = group[0];
    const points: DemoForecastPoint[] = group
      .filter(
        (row): row is ForecastRow & { target_date: string; q10: number; q50: number; q90: number } =>
          row.status === "ok" &&
          row.target_date != null &&
          row.q10 != null &&
          row.q50 != null &&
          row.q90 != null,
      )
      .map((row) => ({ date: row.target_date, q10: row.q10, q50: row.q50, q90: row.q90 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const actual = series.filter((point) => point.measure_id === measure_id);
    const { inside, compared } = countInside(points, actual);
    const status = group.every((row) => row.status === first.status)
      ? first.status
      : group.some((row) => row.status === "error")
        ? "error"
        : first.status;
    bands.push({
      measure_id,
      segment: toSegment(first.history_segment),
      history_days: first.history_days,
      window_start: first.window_start,
      window_end: first.window_end,
      status,
      points,
      inside,
      compared,
    });
  }
  return bands;
}

export function forecastModelFrom(rows: ForecastRow[]): DemoForecastModel | undefined {
  const first = rows[0];
  if (!first) {
    return undefined;
  }
  return { model_id: first.model_id, model_revision: first.model_revision, created_at: first.created_at };
}

export function countBandsBySegment(bands: DemoForecastBand[]) {
  const counts: Record<DemoForecastSegment, number> = { full: 0, limited: 0, insufficient: 0 };
  for (const band of bands) {
    counts[band.segment] += 1;
  }
  return counts;
}
