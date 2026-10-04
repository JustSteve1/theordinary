import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { logIn } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/users";

export const metadata: Metadata = {
  title: "Log in",
};

export default async function LoginPage() {
  if (await getCurrentUser()) {
    redirect("/app");
  }

  return <AuthForm mode="login" action={logIn} />;
}
