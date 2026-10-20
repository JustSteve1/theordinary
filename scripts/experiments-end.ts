import { loadLocalEnv } from "./load-env";
import { db, ready } from "@/src/platform/db";

async function main() {
  loadLocalEnv();

const id = process.argv[2];
if (!id) {
  console.error("Usage: pnpm experiments:end <id>");
  process.exit(1);
}
await ready();
const ended = await db()`
  update experiments
  set status = 'ended', ended_at = now()
  where id = ${id} and status = 'active'
  returning version
`;
if (!ended.length) {
  console.error(`No active version of ${id}.`);
  process.exit(1);
}
await db()`
  update experiment_enrolments
  set left_at = coalesce(left_at, now())
  where experiment_id = ${id} and version = ${ended[0].version} and left_at is null
`;
console.log(`Ended ${id} version ${ended[0].version}. Copy the config to a new version before activating again.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not end the experiment.");
  process.exit(1);
});
