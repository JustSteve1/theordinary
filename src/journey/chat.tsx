import type { Metadata } from "next";

import { ChatPanel } from "@/src/features/chat/panel";
import { sendChat } from "@/src/features/chat/actions";
import { NOVA_MODEL_ID } from "@/src/platform/integrations/nova";
import { clientProbes } from "@/src/platform/recall/answer-key";
import { loadDossier } from "@/src/platform/recall/dossier";
import { requireRecall } from "@/src/platform/recall/guard";
import { listChat } from "@/src/platform/recall/store";
import { sectionLabel } from "@/src/platform/shell/ui";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatScreen() {
  const profile = await requireRecall({ min: "done", max: "done" });
  const [dossier, messages] = await Promise.all([
    loadDossier(profile.id),
    listChat(profile.id),
  ]);
  const suggestions = clientProbes(dossier.facts).map((probe) => probe.question);

  return (
    <div>
      <p className={sectionLabel}>Chat</p>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight">Nova Lite</h1>
      <p className="mt-2 text-[13px] leading-5 text-stone-400">{NOVA_MODEL_ID}</p>
      <div className="mt-6 rounded-[10px] border border-white/10 p-6">
        <ChatPanel messages={messages} suggestions={suggestions} sendChat={sendChat} />
      </div>
    </div>
  );
}
