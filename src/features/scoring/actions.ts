"use server";

import { requireRecall } from "@/src/platform/recall/guard";
import { cleanRubric } from "@/src/platform/recall/rubric";
import { saveRubric } from "@/src/platform/recall/store";

export async function saveScoreItems(value: unknown): Promise<{ error?: string; saved?: boolean }> {
  const profile = await requireRecall({ min: "done", max: "done" });
  const items = cleanRubric(value);
  if (!items) {
    return { error: "Those score items could not be saved." };
  }
  try {
    await saveRubric(profile.id, items);
    return { saved: true };
  } catch {
    return { error: "Those score items could not be saved." };
  }
}
