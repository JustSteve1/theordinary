import type { Metadata } from "next";

import { Panel, RecallFrame } from "@/src/platform/shell/ui";
import { copy } from "@/src/platform/recall/copy";
import { recallDefaults } from "@/src/platform/recall/defaults";

export const metadata: Metadata = { title: "Terms" };

export default function TermsDocumentPage() {
  return (
    <RecallFrame>
      <h1 className="text-[28px] font-medium tracking-tight">Terms</h1>
      <p className="mt-2 text-[#d6d3d1]">Version {recallDefaults.termsVersion}</p>
      <Panel className="mt-4 space-y-3">
        <p>Recall is a personal wellness tool for a short daily check-in about yesterday.</p>
        <p>{copy.whatThisIsnt}</p>
        <p>You can stop a check-in at any time. If you stop, that check-in is not saved.</p>
        <p>You can delete your check-ins or your account from Settings.</p>
      </Panel>
    </RecallFrame>
  );
}