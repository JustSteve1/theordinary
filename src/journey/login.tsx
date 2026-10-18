import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/src/features/account/login-form";
import { Door } from "@/src/platform/shell/door";
import { currentProfile } from "@/src/platform/recall/guard";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  const profile = await currentProfile();
  if (profile?.emailVerifiedAt) {
    redirect("/home");
  }

  return (
    <Door title="Welcome back">
      <LoginForm />
    </Door>
  );
}
