import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

export default function AppHomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.35em] text-stone-500">
        Development
      </p>
      <h1 className="mt-4 text-4xl font-light tracking-tight">
        {siteConfig.name}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-stone-400">
        This is your build area. Add routes under{" "}
        <code className="rounded bg-stone-900 px-1.5 py-0.5 text-sm text-stone-300">
          app/app/
        </code>{" "}
        and flip{" "}
        <code className="rounded bg-stone-900 px-1.5 py-0.5 text-sm text-stone-300">
          NEXT_PUBLIC_SITE_LAUNCHED=true
        </code>{" "}
        when you are ready to go live.
      </p>
      <Link
        href="/"
        className="mt-10 inline-flex w-fit items-center rounded-full border border-stone-700 px-5 py-2 text-sm text-stone-300 transition-colors hover:border-stone-500 hover:text-stone-100"
      >
        View coming soon page
      </Link>
    </main>
  );
}
