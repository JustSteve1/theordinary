import Link from "next/link";

import { ChatForm } from "@/components/chat-form";
import { beeBriefText } from "@/lib/chat/brief";
import { listMessages, loadBeeBrief, saveBeeBrief } from "@/lib/chat/store";
import { bedrockConfig } from "@/lib/chat/bedrock";
import { beeConnection, whoopConnection } from "@/lib/integrations/connections";
import { loadBee } from "@/lib/integrations/bee/client";
import { loadWhoop } from "@/lib/integrations/whoop/client";
import { getCurrentUser } from "@/lib/users";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [bee, whoop, storedBee, messages] = await Promise.all([
    loadBee(),
    loadWhoop(user.id),
    loadBeeBrief(user.id),
    listMessages(user.id),
  ]);
  if (bee.status === "ok") {
    await saveBeeBrief(user.id, beeBriefText(bee));
  }

  const beeLabel =
    bee.status === "ok"
      ? beeConnection(bee).label
      : storedBee
        ? "Last brief"
        : beeConnection(bee).label;

  return (
    <div className="space-y-4">
      <section className="rounded-[10px] border border-white/10 bg-white/[0.03] p-6">
        <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          Chat
        </p>
        <h1 className="mt-3 text-[28px] font-medium tracking-tight">
          This week
        </h1>
        <p className="mt-3 text-[13px] text-stone-400">
          WHOOP {whoopConnection(whoop).label} · Bee {beeLabel}
        </p>
        {bedrockConfig() ? null : (
          <p className="mt-3 text-[13px] leading-5 text-stone-400">
            Add the Bedrock credentials on the server before sending.
          </p>
        )}
        <Link href="/app" className="mt-6 inline-block text-[#0a84ff]">
          Membership
        </Link>
      </section>

      <section className="rounded-[10px] border border-white/10 p-6">
        {messages.length === 0 ? (
          <p className="text-[13px] text-stone-400">Ask about this week.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {messages.map((message) => (
              <li key={message.id} className="py-3">
                <p className="text-[11px] tracking-[0.16em] text-stone-500 uppercase">
                  {message.role === "user" ? "You" : "Ordinary"}
                </p>
                <p className="mt-2 text-[13px] leading-5 whitespace-pre-wrap">
                  {message.body}
                </p>
              </li>
            ))}
          </ul>
        )}
        <ChatForm />
      </section>
    </div>
  );
}
