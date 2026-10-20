import { warehouse } from "@/src/platform/warehouse/client";
import { TABLE_SCHEMAS } from "@/src/platform/warehouse/tables";

export async function eraseMember(memberKey: string) {
  const bq = await warehouse();
  const counts: Record<string, number> = {};
  for (const [name, table] of Object.entries(TABLE_SCHEMAS)) {
    if (!table.columns.some((column) => column.name === "member_key")) {
      continue;
    }
    if (table.dataset !== "ordinary_raw" && table.dataset !== "ordinary_experiments") {
      continue;
    }
    const [job] = await bq.createQueryJob({
      location: "europe-west2",
      query: `delete from \`${process.env.GCP_PROJECT_ID}.${table.dataset}.${name}\` where member_key = @member_key`,
      params: { member_key: memberKey },
    });
    await job.getQueryResults();
    const [metadata] = await job.getMetadata();
    counts[`${table.dataset}.${name}`] = Number(
      metadata.statistics?.query?.numDmlAffectedRows ?? 0,
    );
  }
  return counts;
}
