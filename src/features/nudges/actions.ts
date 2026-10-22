"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nudgeAction } from "@/src/features/nudges/interact";
import { recordNudgeInteraction, saveNudgeSetting } from "@/src/platform/nudges";
import { requireRecall } from "@/src/platform/recall/guard";

export async function interactWithNudge(formData: FormData) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const nudgeId = String(formData.get("nudge") ?? "");
  const action = nudgeAction(formData.get("action"));
  if (nudgeId && action) {
    await recordNudgeInteraction(profile.id, nudgeId, action);
  }
  revalidatePath("/home");
  revalidatePath("/app/nudges");
}

export async function setNudgesEnabled(formData: FormData) {
  const profile = await requireRecall({ min: "done", max: "done" });
  await saveNudgeSetting(profile.id, formData.get("enabled") === "on");
  revalidatePath("/home");
  revalidatePath("/app");
  revalidatePath("/app/nudges");
  redirect("/app");
}