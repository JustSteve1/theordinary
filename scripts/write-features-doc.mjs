import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FEATURES } = require("../warehouse/dataform/includes/registry.js");

const lines = [
  "# Features",
  "",
  "Generated from `warehouse/dataform/includes/registry.js`. Do not edit by hand.",
  "Regenerate with `node scripts/write-features-doc.mjs`.",
  "",
  "`AI.DETECT_ANOMALIES` with TimesFM is not included. It is not confirmed in `europe-west2`, and this project does not query another region.",
  "",
  "Sleep and recovery are dated to the local morning the sleep ended. A WHOOP physiological cycle is dated to the local date of its start, the waking period. Workouts use the local start date. `offset_days` on an experiment is relative to the decision date: 0 is that day, and 1 is the next morning.",
  "",
  "| Feature | Unit | Date rule | Method | Higher is better | Min history |",
  "| --- | --- | --- | --- | --- | --- |",
];

for (const feature of FEATURES) {
  const higher =
    feature.higher_is_better === null || feature.higher_is_better === undefined
      ? ""
      : feature.higher_is_better
        ? "yes"
        : "no";
  lines.push(
    `| \`${feature.id}\` | ${feature.unit} | ${feature.date_rule} | ${feature.method} | ${higher} | ${feature.min_history_days} |`,
  );
}

lines.push("");
writeFileSync("docs/warehouse/features.md", `${lines.join("\n")}`);
console.log(`Wrote ${FEATURES.length} features.`);
