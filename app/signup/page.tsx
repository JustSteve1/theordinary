import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignupForm } from "@/components/recall/signup-form";
import { RecallFrame } from "@/components/recall/ui";
import { currentProfile } from "@/lib/recall/guard";
import { pathForStep } from "@/lib/recall/paths";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  const profile = await currentProfile();
  if (profile?.emailVerifiedAt) {
    redirect(pathForStep(profile.step));
  }

  return (
    <RecallFrame>
      <SignupForm />
    </RecallFrame>
  );
}
