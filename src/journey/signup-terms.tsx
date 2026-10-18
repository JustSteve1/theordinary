import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TermsForm } from "@/src/features/account/terms-form";
import { Door } from "@/src/platform/shell/door";
import { readDraft } from "@/src/platform/recall/cookies";

export const metadata: Metadata = { title: "Terms" };

const bullets = [
  "A voice check-in is transcribed, then the recording is deleted within minutes.",
  "Day capture is optional, off by default, and its audio is deleted after the next check-in.",
  "Scores are stored until you delete them. Account data stays until you delete the account.",
  "This is not a medical device and does not tell you whether you have a health condition.",
  "You can delete your check-ins, or your whole account, from Settings.",
  "Only you can see your check-ins.",
];

export default async function TermsPage() {
  const draft = await readDraft();
  if (!draft) {
    redirect("/signup");
  }

  return (
    <Door title="Before you continue">
      <ul className="mt-6 list-disc space-y-2 pl-5 text-stone-400">
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <p className="mt-4 flex gap-4">
        <Link href="/terms" target="_blank" className="text-[#0a84ff]">
          Terms
        </Link>
        <Link href="/privacy" target="_blank" className="text-[#0a84ff]">
          Privacy policy
        </Link>
      </p>
      <TermsForm />
    </Door>
  );
}
