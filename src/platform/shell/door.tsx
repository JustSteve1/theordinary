import type { ReactNode } from "react";

/** The page behind the front door. Same black field as the homepage, one glass card. */
export function Door({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0a] px-6 py-16 text-[13px] leading-5 text-stone-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(120,113,108,0.12)_0%,_transparent_55%)]"
      />
      <div className="relative z-10 w-full max-w-sm rounded-[22px] border border-white/20 bg-white/[0.04] p-6 backdrop-blur-2xl">
        <p className="text-[11px] font-medium tracking-[0.35em] text-stone-500 uppercase">
          The Ordinary
        </p>
        <h1 className="mt-3 text-[22px] font-medium tracking-tight text-white">
          {title}
        </h1>
        {detail ? (
          <p className="mt-2 text-[13px] leading-5 text-stone-400">{detail}</p>
        ) : null}
        {children}
      </div>
    </main>
  );
}

export const doorButton =
  "inline-flex w-full items-center justify-center rounded-full bg-[#0a84ff] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0077ed] disabled:opacity-60";
