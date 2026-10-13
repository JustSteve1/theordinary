import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/recall/login-form";
import { RecallFrame } from "@/components/recall/ui";
import { currentProfile } from "@/lib/recall/guard";
import { pathForStep } from "@/lib/recall/paths";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  const profile = await currentProfile();
  if (profile?.emailVerifiedAt) {
    redirect(pathForStep(profile.step));
  }

  return (
    <RecallFrame>
      <LoginForm />
    </RecallFrame>
  );
}
