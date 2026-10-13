import type { Metadata } from "next";
import Link from "next/link";

import { CookieBanner } from "@/components/recall/cookie-banner";
import { ButtonLink, FooterLinks, Panel, RecallFrame } from "@/components/recall/ui";
import { copy } from "@/lib/recall/copy";
import { pathForStep } from "@/lib/recall/paths";
import { currentProfile } from "@/lib/recall/guard";

export const metadata: Metadata = {
  title: "Recall",
};

export default async function LandingPage() {
  const profile = await currentProfile();

  return (
    <RecallFrame
      aside={
        profile?.emailVerifiedAt ? (
          <Link
            href={pathForStep(profile.step)}
            className="inline-flex min-h-12 items-center text-[#0a84ff]"
          >
            Your home
          </Link>
        ) : (
          <Link href="/login" className="inline-flex min-h-12 items-center text-[#0a84ff]">
            Log in
          </Link>
        )
      }
    >
      <h1 className="text-[32px] font-medium tracking-tight">
        A two-minute daily chat about your day, and a simple way to see how
        your memory for everyday things is doing over time.
      </h1>
      <div className="mt-8 space-y-4">
        <Panel>
          <h2 className="text-[22px] font-medium">How it works</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            <li>Talk about yesterday.</li>
            <li>Recall compares it with what was captured.</li>
            <li>You see your own trend.</li>
          </ol>
        </Panel>
        <Panel>
          <h2 className="text-[22px] font-medium">Privacy</h2>
          <p className="mt-2 text-[#d6d3d1]">
            A check-in listens while you talk, then keeps the score. Day capture
            is optional and off by default. The data is yours.
          </p>
        </Panel>
        <p>{copy.whatThisIsnt}</p>
      </div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/signup">Sign up</ButtonLink>
        <ButtonLink href="/login" variant="secondary">
          Log in
        </ButtonLink>
      </div>
      <FooterLinks />
      <CookieBanner />
    </RecallFrame>
  );
}
