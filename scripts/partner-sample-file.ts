import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";

import { loadLocalEnv } from "./load-env";
import { assertActivatablePath, experimentFilePath } from "@/src/platform/experiments/activate";
import { sampleCsv } from "@/src/platform/experiments/partner";
import { parseExperiment } from "@/src/platform/experiments/protocol/validate";

async function main() {
  loadLocalEnv();
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: pnpm partner:sample-file <experiment-id>");
    process.exit(1);
  }
  const filePath = experimentFilePath(id);
  assertActivatablePath(filePath);
  const parsed = parseExperiment(JSON.parse(readFileSync(filePath, "utf8")));
  if (!parsed.ok || parsed.kind !== "monitoring") {
    console.error("Sample files are only written for monitoring experiments.");
    process.exit(1);
  }
  const email = process.env.USER1_EMAIL?.trim();
  if (!email) {
    console.error("Set USER1_EMAIL.");
    process.exit(1);
  }
  const csv = sampleCsv(parsed.config, email);
  mkdirSync("tmp", { recursive: true });
  const dest = `tmp/partner-${parsed.config.id}.csv`;
  writeFileSync(dest, csv);
  console.log(dest);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Sample file failed.");
  process.exit(1);
});
