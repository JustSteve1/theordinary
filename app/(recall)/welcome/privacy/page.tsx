import type { Metadata } from "next";

import { HealthForm } from "@/components/recall/health-form";
import { Panel } from "@/components/recall/ui";
import { requireRecall } from "@/lib/recall/guard";

export const metadata: Metadata = { title: "Your data and privacy" };

export default async function PrivacyStepPage() {
  await requireRecall({ min: "privacy", max: "bee" });

  return (
    <div>
      <p>Step 1 of 3</p>
      <div className="mt-2 h-2 rounded-full bg-white/10" aria-hidden>
        <div className="h-2 w-1/3 rounded-full bg-[#0a84ff]" />
      </div>
      <h1 className="mt-6 text-[28px] font-medium tracking-tight">
        Your data and privacy
      </h1>
      <p className="mt-2 text-[#d6d3d1]">Only you can see this.</p>
      <table className="mt-4 w-full text-left">
        <caption className="sr-only">What Recall stores</caption>
        <thead>
          <tr>
            <th className="py-2 pr-3 font-medium">Data</th>
            <th className="py-2 pr-3 font-medium">Stored</th>
            <th className="py-2 font-medium">Kept for</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-white/10">
            <td className="py-3 pr-3">Check-in recordings</td>
            <td className="py-3 pr-3">No. Transcribed, then deleted</td>
            <td className="py-3">Minutes</td>
          </tr>
          <tr className="border-t border-white/10">
            <td className="py-3 pr-3">Day-capture audio</td>
            <td className="py-3 pr-3">No. Transcribed, then deleted</td>
            <td className="py-3">Until the next check-in</td>
          </tr>
          <tr className="border-t border-white/10">
            <td className="py-3 pr-3">Scores</td>
            <td className="py-3 pr-3">Yes</td>
            <td className="py-3">Until you delete them</td>
          </tr>
        </tbody>
      </table>
      <Panel className="mt-6">
        <HealthForm />
      </Panel>
    </div>
  );
}
