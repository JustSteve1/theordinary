import Link from "next/link";

import { siteConfig } from "@/src/platform/site";

export function ComingSoon() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(120,113,108,0.12)_0%,_transparent_55%)]"
      />

      <div className="relative z-10 flex max-w-xl flex-col items-center text-center">
        <p className="mb-6 text-xs font-medium tracking-[0.35em] text-stone-500 uppercase">
          440Hz
        </p>

        <h1 className="text-5xl font-light tracking-tight text-stone-100 sm:text-6xl">
          {siteConfig.name}
        </h1>

        <Link
          href="/signup"
          className="mt-8 inline-flex items-center rounded-full bg-[#0a84ff] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0077ed]"
        >
          Get Started
        </Link>

        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row">
          <a
            href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent(`${siteConfig.name} — notify me`)}`}
            className="inline-flex items-center rounded-full border border-stone-700 px-6 py-2.5 text-sm text-stone-300 transition-colors hover:border-stone-500 hover:text-stone-100"
          >
            Get in touch
          </a>
          <span className="text-sm text-stone-600">Coming soon</span>
        </div>
      </div>

      <footer className="absolute bottom-8 text-xs text-stone-600">
        &copy; {new Date().getFullYear()} {siteConfig.name}
      </footer>
    </main>
  );
}
