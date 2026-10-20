import { eraseMember } from "@/src/platform/warehouse/erase";
import { memberKey } from "@/src/platform/warehouse/member-key";
import { warehouseEnabled } from "@/src/platform/warehouse/client";
import { writeSync } from "@/src/platform/warehouse/sync-state";

export function shouldExportMember(skipError: string | null | undefined) {
  return !skipError;
}

export async function eraseMemberSafely(userId: string) {
  if (!warehouseEnabled()) {
    console.info(JSON.stringify({ warehouse: "skipped", stream: "erasure" }));
    await writeSync({ stream: "skip", scope: userId, success: true, error: "consent withdrawn" });
    return {};
  }
  try {
    const key = memberKey(userId);
    const counts = await eraseMember(key);
    await writeSync({ stream: "erasure", scope: userId, success: true, error: null });
    await writeSync({ stream: "skip", scope: userId, success: true, error: "consent withdrawn" });
    return counts;
  } catch (error) {
    await writeSync({
      stream: "erasure",
      scope: userId,
      error: error instanceof Error ? error.message : "Erasure failed.",
    });
    await writeSync({ stream: "skip", scope: userId, success: true, error: "consent withdrawn" });
    return {};
  }
}

export async function markReexport(userId: string) {
  await writeSync({ stream: "reexport", scope: userId, cursor: null, success: false, error: "granted" });
  await writeSync({ stream: "skip", scope: userId, error: null, success: true });
}
