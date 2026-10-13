import type { Metadata } from "next";

import { Panel, RecallFrame } from "@/components/recall/ui";
import { copy } from "@/lib/recall/copy";
import { recallDefaults } from "@/lib/recall/defaults";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPolicyPage() {
  return (
    <RecallFrame>
      <h1 className="text-[28px] font-medium tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-[#d6d3d1]">Version {recallDefaults.privacyVersion}</p>
      <Panel className="mt-4 space-y-3">
        <p>Recall stores your first name, email, and password so you can sign in.</p>
        <p>Check-in recordings are transcribed and then deleted within minutes. They are not kept.</p>
        <p>Day-capture audio, if you turn it on, is used to build the next check-in and then deleted.</p>
        <p>Scores stay until you delete them. Other people’s words are never stored.</p>
        <p>{copy.whatThisIsnt}</p>
      </Panel>
    </RecallFrame>
  );
}
