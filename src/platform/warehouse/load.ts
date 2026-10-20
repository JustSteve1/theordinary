import type { Table } from "@google-cloud/bigquery";

import { warehouse } from "@/src/platform/warehouse/client";
import { assertNoSpeech } from "@/src/platform/warehouse/firewall";

const BATCH = 10_000;

export async function loadRows(dataset: string, table: string, rows: Record<string, unknown>[]) {
  assertNoSpeech(table, rows);
  if (rows.length === 0) {
    return [];
  }
  const bq = await warehouse();
  const destination = bq.dataset(dataset).table(table);
  const jobs: string[] = [];
  for (let index = 0; index < rows.length; index += BATCH) {
    const slice = rows.slice(index, index + BATCH);
    const jobId = await writeBatch(destination, slice);
    jobs.push(jobId);
  }
  return jobs;
}

async function writeBatch(table: Table, rows: Record<string, unknown>[]) {
  const ndjson = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  return new Promise<string>((resolve, reject) => {
    const stream = table.createWriteStream({
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      writeDisposition: "WRITE_APPEND",
    });
    stream.on("complete", (job: { id?: string }) => resolve(job?.id ?? "load"));
    stream.on("error", reject);
    stream.end(ndjson);
  });
}
