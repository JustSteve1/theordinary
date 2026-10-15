import type { Metadata } from "next";
import Link from "next/link";

import { MicSetup } from "@/src/features/onboarding/mic-setup";
import { requireRecall } from "@/src/platform/recall/guard";

export const metadata: Metadata = { title: "Microphone" };

export default async function MicrophonePage() {
  await requireRecall({ min: "microphone", max: "bee" });

  return (
    <div>
      <p>Step 2 of 3</p>
      <div className="mt-2 h-2 rounded-full bg-white/10" aria-hidden>
        <div className="h-2 w-2/3 rounded-full bg-[#0a84ff]" />
      </div>
      <h1 className="mt-6 text-[28px] font-medium tracking-tight">Microphone</h1>
      <p className="mt-2">
        <Link href="/welcome/privacy" className="inline-flex min-h-12 items-center text-[#0a84ff]">
          Back
        </Link>
      </p>
      <div className="mt-4">
        <MicSetup />
      </div>
    </div>
  );
}
