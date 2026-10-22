import type { ReactNode } from "react";

export const DOMAIN_LABEL: Record<string, string> = {
  health: "Health",
  mindset: "Mindset",
};

/**
 * One visual language for everything the day puts in front of a member:
 * an experiment's instruction, a nudge, or a reward. Nudges and experiments
 * are separate systems underneath; they only share this card.
 */
export function DayCard({
  eyebrow,
  tag,
  children,
  footer,
}: {
  eyebrow: string;
  tag?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="mb-6 rounded-[10px] border border-white/10 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          {eyebrow}
        </p>
        {tag ? (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-stone-400">
            {tag}
          </span>
        ) : null}
      </div>
      <div className="mt-3 text-[18px] leading-7">{children}</div>
      {footer}
    </section>
  );
}
