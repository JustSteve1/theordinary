import type { Metadata } from "next";
import Link from "next/link";

import { BeeStep } from "@/src/features/onboarding/bee-step";
import { requireRecall } from "@/src/platform/recall/guard";

export const metadata: Metadata = { title: "Connect Bee" };

export default async function BeePage() {
  const profile = await requireRecall({ min: "bee", max: "bee" });

  return (
    <div>
      <p>Step 3 of 3</p>
      <div className="mt-2 h-2 rounded-full bg-white/10" aria-hidden>
        <div className="h-2 w-full rounded-full bg-[#0a84ff]" />
      </div>
      <h1 className="mt-6 text-[28px] font-medium tracking-tight">Connect Bee</h1>
      <p className="mt-2">
        <Link
          href="/welcome/microphone"
          className="text-[#0a84ff]"
        >
          Back
        </Link>
      </p>
      <div className="mt-4">
        <BeeStep dayCapture={profile.settings.dayCapture} />
      </div>
    </div>
  );
}
