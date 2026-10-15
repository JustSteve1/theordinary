import Link from "next/link";

import { NOVA_MODEL_ID } from "@/src/platform/integrations/nova";
import { sectionLabel } from "@/src/platform/shell/ui";

export function ChatTile() {
  return (
    <section className="rounded-[10px] border border-white/10 bg-white/[0.03] p-6">
      <p className={sectionLabel}>Chat</p>
      <h2 className="mt-3 text-[28px] font-medium tracking-tight">Nova Lite</h2>
      <p className="mt-2 text-[13px] leading-5 text-stone-400">{NOVA_MODEL_ID}</p>
      <p className="mt-4 text-[13px] leading-5 text-stone-400">
        The same record as Hello World. Talks, the check-in questions, Bee, and WHOOP.
      </p>
      <p className="mt-4">
        <Link href="/app/chat" className="text-[#0a84ff]">
          Open chat
        </Link>
      </p>
    </section>
  );
}
