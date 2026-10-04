import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/users";

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
    <div className="min-h-screen bg-[#0a0a0a] text-[13px] text-stone-100">
      <header className="flex h-12 items-center justify-between border-b border-white/10 px-4">
        <p className="font-medium tracking-tight">The Ordinary</p>
        <div className="flex items-center gap-4">
          <p className="text-stone-400">{user.name}</p>
          <form action={signOut}>
            <button type="submit" className="text-[#0a84ff]">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-6 py-8">{children}</main>
    </div>
  );
}
