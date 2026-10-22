import React from "react";

import { BandCaption, Sparkline } from "@/src/features/demo/sparkline";
import { latestBaseline, HOME_MEASURES } from "@/src/platform/baseline/snapshot";
import { formatDay } from "@/src/platform/recall/dates";

const LABEL: Record<(typeof HOME_MEASURES)[number], string> = {
  "recall.accuracy": "Accuracy",
  "recall.richness": "Richness",
};

const EYEBROW = "Your baseline";

export async function BaselineCard({ userId }: { userId: string }) {
  const snapshot = await latestBaseline(userId);

  if (!snapshot) {
    return (
      <section className="mb-6 rounded-[10px] border border-white/10 p-6 text-stone-400">
        <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          {EYEBROW}
        </p>
        <p className="mt-3 text-[18px] leading-7 text-stone-200">
          Chronos-2 hasn&apos;t drawn your baseline yet.
        </p>
        <p className="mt-2 text-sm">
          Once the morning pipeline has run, this card shows how your Accuracy and Richness
          are expected to land, as a grey range under your actual line. Nudges and rewards are
          then measured against it.
        </p>
      </section>
    );
  }

  const dates = [...new Set(snapshot.series.map((point) => point.date))].sort();
  const revision = snapshot.model.model_revision.slice(0, 7);

  return (
    <section className="mb-6 rounded-[10px] border border-white/10 p-6 text-stone-400">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          {EYEBROW}
        </p>
        <span className="text-[11px] text-stone-500">
          {snapshot.model.model_id} · {revision}
        </span>
      </div>
      <p className="mt-3 text-[18px] leading-7 text-stone-200">
        How Chronos-2 expects you to answer.
      </p>
      <p className="mt-1 text-sm">
        Grey is the expected range from your own history. Blue is what you actually scored.
        Experiments are judged by whether they move you out of that range.
      </p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {HOME_MEASURES.map((measure) => {
          const band = snapshot.bands.find((item) => item.measure_id === measure);
          const points = dates.map((date) => {
            const row = snapshot.series.find(
              (point) => point.date === date && point.measure_id === measure,
            );
            return { date, value_number: row?.value_number ?? null };
          });
          return (
            <div key={measure}>
              <p className="text-sm font-medium text-stone-200">{LABEL[measure]}</p>
              <Sparkline points={points} markers={[]} band={band} />
              <BandCaption band={band} />
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-stone-500">
        Last drawn {formatDay(snapshot.created_at.slice(0, 10))}. Not a measured effect.
      </p>
    </section>
  );
}
