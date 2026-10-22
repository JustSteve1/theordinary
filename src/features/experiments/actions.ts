"use server";

import { respond } from "@/src/platform/experiments/store";
import { emitNudgeEvent } from "@/src/platform/nudges";
import { requireRecall } from "@/src/platform/recall/guard";

export async function respondToDecision(formData: FormData) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const response = formData.get("response") === "skipped" ? "skipped" : "done";
  const decisionId = String(formData.get("decision") ?? "");
  await respond(decisionId, profile.id, response);
  if (response === "done" && decisionId) {
    await emitNudgeEvent({ type: "experiment_done", userId: profile.id, eventId: decisionId }).catch(
      (error) => console.error("nudge", error instanceof Error ? error.message : error),
    );
  }
}
