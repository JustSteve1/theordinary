import React from "react";

import { DEMO_MEASURES, type DemoForecastBand, type DemoSnapshot } from "@/src/features/demo/snapshot";

const sectionLabel = "text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase";

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[10px] border border-white/10 p-4 ${className}`}>{children}</section>
  );
}

export type DemoScore = {
  accuracy: number | null;
  richness: number | null;
  recordedAt: string | null;
  dimensions: { id: string; label: string; display: number }[];
};

const SHARED = ["partner", "schedule", "decision_points", "measures", "partner_measures", "primary_outcome"];

export function DemoView({ snapshot, score }: { snapshot: DemoSnapshot; score: DemoScore | null }) {
  return (
    <div className="space-y-8 text-stone-300">
      <header>
        <p className={sectionLabel}>Hackathon demo</p>
        <h1 className="mt-2 text-[32px] font-medium leading-9 tracking-tight text-stone-100">
          Experiments, as JSON
        </h1>
      </header>

      <section>
        <h2 className="text-[22px] font-medium text-stone-100">An experiment is a JSON.</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <JsonCard
            title="BARBARA dry run"
            caption="Measurement partner"
            value={snapshot.experiment}
          />
          <JsonCard
            title="Spotify mood lift"
            caption="Action partner"
            value={snapshot.concept}
          />
        </div>
        <p className="mt-3 text-sm text-stone-500">
          Shared blocks: partner, schedule or decision points, measures, outcomes.
        </p>
      </section>

      <section>
        <h2 className="text-[22px] font-medium text-stone-100">Latest check-in</h2>
        <p className="mt-1 text-sm text-stone-500">Live from Neon. Updates when a check-in is saved.</p>
        {score ? (
          <Panel className="mt-3">
            <p className="text-stone-100">Accuracy {figure(score.accuracy)}</p>
            <p className="mt-1 text-stone-100">Richness {figure(score.richness)}</p>
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {score.dimensions.map((dimension) => (
                <li key={dimension.id}>
                  {dimension.label} {figure(dimension.display)}
                </li>
              ))}
            </ul>
            {score.recordedAt ? (
              <p className="mt-3 text-sm text-stone-500">{new Date(score.recordedAt).toLocaleString("en-GB")}</p>
            ) : null}
          </Panel>
        ) : (
          <p className="mt-3">No check-in yet.</p>
        )}
      </section>

      <section>
        <h2 className="text-[22px] font-medium text-stone-100">30 days of real life</h2>
        <p className="mt-1 text-sm text-stone-500">Gaps are missing days. Partner markers are synthetic.</p>
        {snapshot.forecast_bands?.length ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-5 rounded-sm bg-stone-400/25" aria-hidden="true" />
              Expected range without any experiment
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-5 bg-[#0a84ff]" aria-hidden="true" />
              What actually happened
            </span>
          </p>
        ) : null}
        <div className="mt-4 space-y-4">
          {DEMO_MEASURES.map((measure) => {
            const band = snapshot.forecast_bands?.find((row) => row.measure_id === measure.id);
            return (
              <Panel key={measure.id}>
                <p className={sectionLabel}>{measure.label}</p>
                <Sparkline
                  points={snapshot.series.filter((row) => row.measure_id === measure.id)}
                  markers={snapshot.partner_points}
                  band={band}
                />
                <BandCaption band={band} />
              </Panel>
            );
          })}
        </div>
        {snapshot.partner_points.some((row) => row.is_synthetic) ? (
          <p className="mt-3 inline-block rounded-full border border-[#0a84ff]/40 px-3 py-1 text-sm text-[#0a84ff]">
            Synthetic partner data
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="text-[22px] font-medium text-stone-100">Coverage</h2>
        <Panel className="mt-3">
          <p>
            Daily rows {snapshot.coverage.daily_filled}/{snapshot.coverage.daily_rows}
            {snapshot.coverage.daily_fill_rate != null
              ? ` (${Math.round(snapshot.coverage.daily_fill_rate * 100)}%)`
              : ""}
          </p>
          <p className="mt-1">
            Partner measures received {snapshot.coverage.partner_filled}/{snapshot.coverage.partner_rows}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Snapshot {new Date(snapshot.generated_at).toLocaleString("en-GB")}
          </p>
          {snapshot.forecast_model ? (
            <p className="mt-1 text-sm text-stone-500">
              Model: {snapshot.forecast_model.model_id} ({snapshot.forecast_model.model_revision.slice(0, 7)}),
              run {new Date(snapshot.forecast_model.created_at).toLocaleString("en-GB")}
            </p>
          ) : null}
          <p className="mt-3">
            No speech or identity leaves The Ordinary. Partners see aggregates only.
          </p>
        </Panel>
      </section>

      <section>
        <h2 className="text-[22px] font-medium text-stone-100">The engine finds what&apos;s real</h2>
        <div className="mt-3 space-y-3">
          {snapshot.engine_proof.map((row) => (
            <Panel key={row.experiment_id}>
              <p className={sectionLabel}>Scenario {row.experiment_id}</p>
              <p className="mt-2 text-stone-100">
                Planted {signed(row.true_effect)} · estimate {signed(row.beta)} · {row.status}
              </p>
              <IntervalBar low={row.p025} high={row.p975} point={row.beta} planted={row.true_effect} />
            </Panel>
          ))}
          {snapshot.associations.map((row) => (
            <Panel key={row.feature_id}>
              <p className={sectionLabel}>{row.feature_id}</p>
              <p className="mt-2 text-[#0a84ff]">Association, not cause · one member · 30 days</p>
              <p className="mt-1">
                {signed(row.beta)} · n={row.n_with_outcome ?? 0}
              </p>
              <IntervalBar low={row.p025} high={row.p975} point={row.beta} />
            </Panel>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[22px] font-medium text-stone-100">What production adds</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Invites and consent</li>
          <li>Study IDs</li>
          <li>Research tasks</li>
          <li>Partner reports</li>
          <li>Member insights</li>
          <li>Spotify components</li>
        </ul>
      </section>
    </div>
  );
}

function JsonCard({ title, caption, value }: { title: string; caption: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <Panel>
      <p className={sectionLabel}>{caption}</p>
      <p className="mt-1 text-stone-100">{title}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-[#0a84ff]">Show JSON</summary>
        <pre className="mt-3 overflow-x-auto text-[12px] leading-5 text-stone-400">
          {text.split("\n").map((line, index) => (
            <span key={index} className={sharedLine(line) ? "text-[#0a84ff]" : undefined}>
              {line}
              {"\n"}
            </span>
          ))}
        </pre>
      </details>
    </Panel>
  );
}

function sharedLine(line: string) {
  return SHARED.some((key) => line.includes(`"${key}"`));
}

const BAND_STYLE = {
  full: { fill: "#a8a29e", fillOpacity: 0.25, outline: false },
  limited: { fill: "#a8a29e", fillOpacity: 0.12, outline: true },
} as const;

function Sparkline({
  points,
  markers,
  band,
}: {
  points: { date: string; value_number: number | null }[];
  markers: { date: string }[];
  band?: DemoForecastBand;
}) {
  const width = 320;
  const height = 72;
  const drawn = band && band.segment !== "insufficient" && band.points.length ? band : undefined;
  const bandPoints = drawn
    ? drawn.points
        .map((point) => ({ ...point, index: points.findIndex((row) => row.date === point.date) }))
        .filter((point) => point.index >= 0)
    : [];
  const values = points.map((point) => point.value_number).filter((value): value is number => value != null);
  const bandValues = bandPoints.flatMap((point) => [point.q10, point.q90]);
  const all = [...values, ...bandValues];
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const span = max - min || 1;
  const x = (index: number) => (points.length < 2 ? width / 2 : (index / (points.length - 1)) * (width - 8) + 4);
  const y = (value: number) => height - 8 - ((value - min) / span) * (height - 16);
  const bandArea = bandPoints.length
    ? [
        ...bandPoints.map((point, i) => `${i ? "L" : "M"}${x(point.index).toFixed(1)},${y(point.q90).toFixed(1)}`),
        ...[...bandPoints].reverse().map((point) => `L${x(point.index).toFixed(1)},${y(point.q10).toFixed(1)}`),
        "Z",
      ].join(" ")
    : "";
  const bandMedian = bandPoints
    .map((point, i) => `${i ? "L" : "M"}${x(point.index).toFixed(1)},${y(point.q50).toFixed(1)}`)
    .join(" ");
  const windowIndex = drawn ? points.findIndex((row) => row.date === drawn.window_start) : -1;
  const style = drawn ? BAND_STYLE[drawn.segment as keyof typeof BAND_STYLE] : undefined;
  const segments: string[] = [];
  let current = "";
  points.forEach((point, index) => {
    if (point.value_number == null) {
      if (current) {
        segments.push(current);
        current = "";
      }
      return;
    }
    const command = current ? "L" : "M";
    current += `${command}${x(index).toFixed(1)},${y(point.value_number).toFixed(1)} `;
  });
  if (current) {
    segments.push(current);
  }
  const markerXs = markers
    .map((marker) => points.findIndex((point) => point.date === marker.date))
    .filter((index) => index >= 0);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label="Daily values">
      {bandArea && style ? (
        <path
          data-band={drawn?.segment}
          d={bandArea}
          fill={style.fill}
          fillOpacity={style.fillOpacity}
          stroke={style.outline ? style.fill : "none"}
          strokeOpacity={style.outline ? 0.6 : undefined}
          strokeWidth={style.outline ? 1 : undefined}
          strokeDasharray={style.outline ? "3 3" : undefined}
        />
      ) : null}
      {bandMedian && style ? (
        <path
          data-band-median=""
          d={bandMedian}
          fill="none"
          stroke={style.fill}
          strokeOpacity={0.9}
          strokeWidth="1"
          strokeDasharray="4 3"
        />
      ) : null}
      {windowIndex >= 0 ? (
        <line
          data-window-start=""
          x1={x(windowIndex).toFixed(1)}
          x2={x(windowIndex).toFixed(1)}
          y1={4}
          y2={height - 4}
          stroke="#a8a29e"
          strokeOpacity={0.7}
          strokeWidth="1"
        />
      ) : null}
      {segments.map((d, index) => (
        <path key={index} d={d.trim()} fill="none" stroke="#0a84ff" strokeWidth="1.5" />
      ))}
      {markerXs.map((index) => (
        <circle key={index} cx={x(index)} cy={height - 6} r="3" fill="#f5f5f4" />
      ))}
    </svg>
  );
}

const BAND_LABEL = "Baseline expectation, no experiment yet";

function BandCaption({ band }: { band?: DemoForecastBand }) {
  if (!band) {
    return null;
  }
  if (band.segment === "insufficient" || !band.points.length) {
    return (
      <p className="mt-2 text-sm text-stone-500">
        Not enough history yet for a baseline ({band.history_days} days).
      </p>
    );
  }
  const agreement =
    band.compared != null && band.inside != null
      ? ` Actual inside the ${band.segment === "full" ? "expected range" : "range"} on ${band.inside} of ${band.compared} days.`
      : "";
  const caption =
    band.segment === "full"
      ? `Forecast by Chronos-2 from ${band.history_days} days before. Not a measured effect.${agreement}`
      : `Early estimate: only ${band.history_days} days of history, so the range is less certain. Not a measured effect.${agreement}`;
  return (
    <div className="mt-2">
      <p className="text-sm text-stone-300">{BAND_LABEL}</p>
      <p className="mt-0.5 text-sm text-stone-500">{caption}</p>
    </div>
  );
}

function IntervalBar({
  low,
  high,
  point,
  planted,
}: {
  low: number | null;
  high: number | null;
  point: number | null;
  planted?: number;
}) {
  const values = [low, high, point, planted].filter((value): value is number => value != null);
  if (!values.length) {
    return null;
  }
  const min = Math.min(-1, ...values) - 1;
  const max = Math.max(1, ...values) + 1;
  const place = (value: number) => `${((value - min) / (max - min)) * 100}%`;
  return (
    <div className="relative mt-3 h-6 rounded-full bg-white/10">
      {low != null && high != null ? (
        <span
          className="absolute top-2 h-2 rounded-full bg-[#0a84ff]/50"
          style={{ left: place(low), width: `calc(${place(high)} - ${place(low)})` }}
        />
      ) : null}
      {point != null ? (
        <span className="absolute top-1 h-4 w-1 bg-stone-100" style={{ left: place(point) }} />
      ) : null}
      {planted != null ? (
        <span className="absolute top-1 h-4 w-1 bg-[#0a84ff]" style={{ left: place(planted) }} />
      ) : null}
    </div>
  );
}

function figure(value: number | null) {
  return value == null ? "—" : String(Math.round(value));
}

function signed(value: number | null) {
  if (value == null) {
    return "—";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}
