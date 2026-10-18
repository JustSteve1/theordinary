import type { Metadata } from "next";

import { ChatPanel } from "@/src/features/chat/panel";
import { sendChat } from "@/src/features/chat/actions";
import { describeWhoop } from "@/src/platform/context/whoop";
import { loadBee } from "@/src/platform/integrations/bee";
import { loadWhoop } from "@/src/platform/integrations/whoop";
import { NOVA_MODEL_ID } from "@/src/platform/integrations/nova";
import { requireRecall } from "@/src/platform/recall/guard";
import { listChat } from "@/src/platform/recall/store";
import { doorButton } from "@/src/platform/shell/door";
import { sectionLabel } from "@/src/platform/shell/ui";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatScreen() {
  const profile = await requireRecall({ min: "done", max: "done" });
  const [messages, whoop, bee] = await Promise.all([
    listChat(profile.id),
    loadWhoop(profile.id),
    loadBee(profile.id),
  ]);
  const readings = describeWhoop(whoop).split("\n").slice(1);

  return (
    <div>
      <p className={sectionLabel}>Chat</p>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight">Nova Lite</h1>
      <p className="mt-2 text-[13px] leading-5 text-stone-400">
        {NOVA_MODEL_ID}
      </p>
      <section className="mt-6 rounded-[10px] border border-white/10 p-6">
        <h2 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          Bee
        </h2>
        <p className="mt-4 text-[13px] leading-5 text-stone-300">
          {bee.status === "ok"
            ? `Connected${bee.name ? ` as ${bee.name}` : ""}${bee.via === "account" ? "" : " on this machine"}.`
            : bee.status === "unauthorized"
              ? "The saved Bee token was not accepted."
              : "Not connected. Add a Bee token in Integrations."}
        </p>
        <h2 className="mt-6 text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          WHOOP
        </h2>
        {readings.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {readings.map((line) => (
              <li key={line} className="text-[13px] leading-5 text-stone-300">
                {line.replace(/^- /, "")}
              </li>
            ))}
          </ul>
        ) : (
          <>
            {whoop.message ? (
              <p className="mt-4 text-[13px] leading-5 text-stone-400">
                {whoop.message}
              </p>
            ) : (
              <p className="mt-4 text-[13px] leading-5 text-stone-400">
                Sign in with WHOOP so answers can use your recovery, sleep, and
                strain.
              </p>
            )}
            <a href="/api/whoop/connect" className={`mt-4 ${doorButton}`}>
              Sign in with WHOOP
            </a>
          </>
        )}
      </section>
      <div className="mt-6 rounded-[10px] border border-white/10 p-6">
        <ChatPanel messages={messages} suggestions={[]} sendChat={sendChat} />
      </div>
    </div>
  );
}
