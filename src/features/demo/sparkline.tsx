import React from "react";

import type { DemoForecastBand } from "@/src/features/demo/snapshot";

const BAND_STYLE = {
  full: { fill: "#a8a29e", fillOpacity: 0.25, outline: false },
  limited: { fill: "#a8a29e", fillOpacity: 0.12, outline: true },
} as const;

export function Sparkline({
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

export function BandCaption({ band }: { band?: DemoForecastBand }) {
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
