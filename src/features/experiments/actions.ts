"use server";

import { respond } from "@/src/platform/experiments/store";
import { requireRecall } from "@/src/platform/recall/guard";

export async function respondToDecision(formData: FormData) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const response = formData.get("response") === "skipped" ? "skipped" : "done";
  await respond(String(formData.get("decision") ?? ""), profile.id, response);
}
