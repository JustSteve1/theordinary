"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { askBedrock, bedrockConfig } from "@/lib/chat/bedrock";
import { membershipBrief, beeBriefText } from "@/lib/chat/brief";
import {
  listMessages,
  loadBeeBrief,
  saveBeeBrief,
  saveExchange,
} from "@/lib/chat/store";
import { loadBee } from "@/lib/integrations/bee/client";
import { loadWhoop } from "@/lib/integrations/whoop/client";
import { getCurrentUser } from "@/lib/users";

export type ChatState = {
  error: string;
};

export async function sendChat(
  _state: ChatState,
  formData: FormData,
): Promise<ChatState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    return { error: "Write a message first." };
  }
  if (message.length > 2000) {
    return { error: "Keep the message under 2000 characters." };
  }
  if (!bedrockConfig()) {
    return { error: "Chat is not configured on this server." };
  }

  const [bee, whoop, storedBee, history] = await Promise.all([
    loadBee(),
    loadWhoop(user.id),
    loadBeeBrief(user.id),
    listMessages(user.id),
  ]);
  if (bee.status === "ok") {
    await saveBeeBrief(user.id, beeBriefText(bee));
  }
  const timeZone =
    bee.status === "ok" && bee.timezone ? bee.timezone : user.timezone;

  try {
    const reply = await askBedrock({
      brief: membershipBrief({
        name: user.name,
        timeZone,
        now: Date.now(),
        bee,
        storedBee,
        whoop,
      }),
      history,
      message,
    });
    await saveExchange(user.id, message, reply);
  } catch (error) {
    console.error("chat", error instanceof Error ? error.message : "unknown");
    return {
      error:
        error instanceof Error &&
        error.message === "Chat is not configured on this server."
          ? error.message
          : "Chat could not reply. Try again.",
    };
  }

  revalidatePath("/app/chat");
  redirect("/app/chat");
}
