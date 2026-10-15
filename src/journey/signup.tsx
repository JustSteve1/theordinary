import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignupForm } from "@/src/features/account/signup-form";
import { RecallFrame } from "@/src/platform/shell/ui";
import { currentProfile } from "@/src/platform/recall/guard";
import { pathForStep } from "@/src/platform/recall/paths";

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
