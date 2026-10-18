"use server";

import { composeContext } from "@/src/platform/context";
import { askNova, novaFailure } from "@/src/platform/integrations/nova";
import { requireRecall } from "@/src/platform/recall/guard";
import { insertChat, listChat } from "@/src/platform/recall/store";

export async function sendChat(text: string): Promise<{ error?: string }> {
  const profile = await requireRecall({ min: "done", max: "done" });
  const body = String(text ?? "").trim().slice(0, 2000);
  if (!body) {
    return { error: "Write a message first." };
  }

  try {
    const [system, history] = await Promise.all([
      composeContext(profile.name, profile.id),
      listChat(profile.id),
    ]);
    const messages = [
      ...history.map((turn) => ({ role: turn.role, text: turn.body })),
      { role: "user" as const, text: body },
    ];
    const reply = await askNova({
      system,
      messages,
    });
    await insertChat(profile.id, "user", body);
    await insertChat(profile.id, "assistant", reply);
    return {};
  } catch (error) {
    return { error: novaFailure(error) };
  }
}
