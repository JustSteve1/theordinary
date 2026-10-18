import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/src/features/account/login-form";
import { Door } from "@/src/platform/shell/door";
import { currentProfile } from "@/src/platform/recall/guard";
import { pathForStep } from "@/src/platform/recall/paths";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  const profile = await currentProfile();
  if (profile?.emailVerifiedAt) {
    redirect(pathForStep(profile.step));
  }

  return (
    <Door title="Welcome back">
      <LoginForm />
    </Door>
  );
}
