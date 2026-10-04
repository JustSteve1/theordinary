import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { signUp } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/users";

export const metadata: Metadata = {
  title: "Sign up",
};

export default async function SignUpPage() {
  if (await getCurrentUser()) {
    redirect("/app");
  }

  return <AuthForm mode="signup" action={signUp} />;
}
