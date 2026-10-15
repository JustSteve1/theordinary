import { redirect } from "next/navigation";

import { getCurrentUser } from "@/src/platform/current-user";
import { AccountMenu } from "@/src/platform/shell/account-menu";
import { RecallFrame } from "@/src/platform/shell/ui";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <RecallFrame account={<AccountMenu name={user.name} />}>{children}</RecallFrame>
  );
}
