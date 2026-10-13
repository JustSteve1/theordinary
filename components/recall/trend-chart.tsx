"use client";

import { useState } from "react";

import { Button } from "@/components/recall/ui";
import { formatDay } from "@/lib/recall/dates";
import { recallDefaults } from "@/lib/recall/defaults";
import type { SessionRecord } from "@/lib/recall/types";
import { rangeLabel } from "@/lib/recall/trend";

export function TrendChart({ sessions }: { sessions: SessionRecord[] }) {
  const [table, setTable] = useState(false);
  const [selected, setSelected] = useState<string | null>(sessions.at(-1)?.id ?? null);
  const points = sessions.filter((session) => !session.aborted && session.composite !== null);
  const band = bandFrom(points);
  const current = points.find((session) => session.id === selected) ?? null;

  return (
    <div>
      <Button type="button" variant="secondary" onClick={() => setTable((value) => !value)}>
        {table ? "View as chart" : "View as table"}
      </Button>
      {table ? (
        <table className="mt-4 w-full text-left">
          <caption className="sr-only">Your check-ins</caption>
          <thead>
            <tr>
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Part of day</th>
              <th className="py-2 pr-3 font-medium">Score</th>
              <th className="py-2 font-medium">Range</th>
            </tr>
          </thead>
          <tbody>
            {points.map((session) => (
              <tr key={session.id} className="border-t border-white/10">
                <td className="py-3 pr-3">{formatDay(session.date)}</td>
                <td className="py-3 pr-3">{labelWindow(session.window)}</td>
                <td className="py-3 pr-3">{Math.round(session.composite ?? 0)}</td>
                <td className="py-3">{rangeLabel(session.trend.flag)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Chart
          points={points}
          selected={selected}
          onSelect={setSelected}
          mean={band.mean}
          sd={band.sd}
        />
      )}
      {current ? <Detail session={current} /> : null}
    </div>
  );
}

function bandFrom(points: SessionRecord[]) {
  const latest = [...points]
    .reverse()
    .find((session) => session.trend.baselineMean !== null);
  if (
    latest?.trend.baselineMean !== null &&
    latest?.trend.baselineMean !== undefined &&
    latest.trend.baselineSd !== null
  ) {
    return { mean: latest.trend.baselineMean, sd: latest.trend.baselineSd };
  }
  const clean = points.filter(
    (session) =>
      !session.confounders.poorSleep && !session.confounders.unwellOrAlcohol,
  );
  if (clean.length < recallDefaults.minBaseline) {
    return { mean: null, sd: null };
  }
  const values = clean.map((session) => session.composite ?? 0);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) };
}

function Chart({
  points,
  selected,
  onSelect,
  mean,
  sd,
}: {
  points: SessionRecord[];
  selected: string | null;
  onSelect: (id: string) => void;
  mean: number | null;
  sd: number | null;
}) {
  const width = 320;
  const height = 180;
  const pad = 16;
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const y = (value: number) => pad + ((100 - value) / 100) * (height - pad * 2);
  const showBand = mean !== null && sd !== null && points.length >= recallDefaults.minBaseline;
  const low = showBand ? Math.max(0, mean - 1.5 * sd) : 0;
  const high = showBand ? Math.min(100, mean + 1.5 * sd) : 0;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 w-full" role="img" aria-label="Score trend">
      {showBand ? (
        <rect
          x={pad}
          y={y(high)}
          width={width - pad * 2}
          height={Math.max(2, y(low) - y(high))}
          fill="#0a84ff"
          opacity="0.18"
        >
          <title>Your usual range</title>
        </rect>
      ) : null}
      {points.length > 1 ? (
        <polyline
          fill="none"
          stroke="#0a84ff"
          strokeWidth="2"
          points={points
            .map((session, index) => `${pad + index * step},${y(session.composite ?? 0)}`)
            .join(" ")}
        />
      ) : null}
      {points.map((session, index) => {
        const cx = pad + index * step;
        const cy = y(session.composite ?? 0);
        const confounder = session.confounders.poorSleep || session.confounders.unwellOrAlcohol;
        return (
          <g key={session.id}>
            <circle
              cx={cx}
              cy={cy}
              r={selected === session.id ? 7 : 5}
              fill={confounder ? "#ff9f0a" : "#0a84ff"}
              role="button"
              tabIndex={0}
              aria-pressed={selected === session.id}
              aria-label={`${formatDay(session.date)}, ${Math.round(session.composite ?? 0)}, ${rangeLabel(session.trend.flag)}${confounder ? `, ${session.confounders.poorSleep ? "Sleep" : "Unwell"}` : ""}`}
              onClick={() => onSelect(session.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(session.id);
                }
              }}
            />
            {confounder ? (
              <text x={cx} y={height - 2} textAnchor="middle" fill="#d6d3d1" fontSize="10">
                {session.confounders.poorSleep ? "Sleep" : "Unwell"}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function Detail({ session }: { session: SessionRecord }) {
  const note = session.confounders.poorSleep
    ? "You mentioned sleeping badly."
    : session.confounders.unwellOrAlcohol
      ? "You mentioned feeling unwell."
      : null;
  return (
    <div className="mt-4 rounded-[10px] border border-white/10 p-4">
      <p>{formatDay(session.date)}</p>
      <p>{labelWindow(session.window)}</p>
      <p>Score {Math.round(session.composite ?? 0)}</p>
      <p>{rangeLabel(session.trend.flag)}</p>
      {note ? <p>{note}</p> : null}
    </div>
  );
}

function labelWindow(windowName: string) {
  if (!windowName) {
    return "Yesterday";
  }
  return windowName.charAt(0).toUpperCase() + windowName.slice(1);
}
