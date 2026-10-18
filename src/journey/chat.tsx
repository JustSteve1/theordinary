import type { Metadata } from "next";

import { ChatPanel } from "@/src/features/chat/panel";
import { sendChat } from "@/src/features/chat/actions";
import { NOVA_MODEL_ID } from "@/src/platform/integrations/nova";
import { requireRecall } from "@/src/platform/recall/guard";
import { listChat } from "@/src/platform/recall/store";
import { sectionLabel } from "@/src/platform/shell/ui";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatScreen() {
  const profile = await requireRecall({ min: "done", max: "done" });
  const messages = await listChat(profile.id);

  return (
    <div>
      <p className={sectionLabel}>Chat</p>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight">Nova Lite</h1>
      <p className="mt-2 text-[13px] leading-5 text-stone-400">{NOVA_MODEL_ID}</p>
      <div className="mt-6 rounded-[10px] border border-white/10 p-6">
        <ChatPanel messages={messages} suggestions={[]} sendChat={sendChat} />
      </div>
    </div>
  );
}
