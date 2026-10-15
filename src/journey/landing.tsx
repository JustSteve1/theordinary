import type { Metadata } from "next";

import { CookieBanner } from "@/src/features/account/cookie-banner";
import { currentProfile } from "@/src/platform/recall/guard";
import { copy } from "@/src/platform/recall/copy";
import { AccountMenu } from "@/src/platform/shell/account-menu";
import {
  ButtonLink,
  FooterLinks,
  Panel,
  RecallFrame,
  sectionLabel,
} from "@/src/platform/shell/ui";

export const metadata: Metadata = {
  title: "Recall",
};

export default async function LandingPage() {
  const profile = await currentProfile();

  return (
    <RecallFrame
      account={
        profile?.emailVerifiedAt ? <AccountMenu name={profile.name} /> : undefined
      }
    >
      <p className={sectionLabel}>The Ordinary</p>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight">
        A two-minute daily chat about your day, and a simple way to see how
        your memory for everyday things is doing over time.
      </h1>
      <div className="mt-8 space-y-4">
        <Panel>
          <h2 className={sectionLabel}>How it works</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6 text-stone-400">
            <li>Talk about yesterday.</li>
            <li>Recall compares it with what was captured.</li>
            <li>You see your own trend.</li>
          </ol>
        </Panel>
        <Panel>
          <h2 className={sectionLabel}>Privacy</h2>
          <p className="mt-3 text-[13px] leading-5 text-stone-400">
            A check-in listens while you talk, then keeps the score. Day capture
            is optional and off by default. The data is yours.
          </p>
        </Panel>
        <p className="text-stone-400">{copy.whatThisIsnt}</p>
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
