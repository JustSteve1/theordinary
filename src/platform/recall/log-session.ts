import { spawn } from "node:child_process";
import path from "node:path";

import type { SessionRecord, TrendFlag } from "@/src/platform/recall/types";

const SCRIPT = path.join(
  process.cwd(),
  "skills",
  "episodic-recall",
  "log_session.py",
);

const FLAGS = new Set<TrendFlag>([
  "insufficient_baseline",
  "within_range",
  "above_range",
  "below_range",
  "review_suggested",
]);

/**
 * Ask the episodic-recall skill to log one session.
 * The script rebuilds the trend and returns the record future days may keep.
 * Spoken words are not part of this call.
 */
export async function logSession(input: {
  id: string;
  recordedAt: string;
  date: string;
  window: string;
  aborted: boolean;
  composite: number | null;
  coreRecall: number | null;
  detailRecall: number | null;
  intrusionRate: number | null;
  confounders: SessionRecord["confounders"];
  prior: SessionRecord[];
}): Promise<SessionRecord> {
  const payload = {
    id: input.id,
    recorded_at: input.recordedAt,
    date: input.date,
    window: input.window,
    aborted: input.aborted,
    composite: input.composite,
    core_recall: input.coreRecall,
    detail_recall: input.detailRecall,
    intrusion_rate: input.intrusionRate,
    confounders: {
      poor_sleep: input.confounders.poorSleep,
      unwell_or_alcohol: input.confounders.unwellOrAlcohol,
    },
    prior: input.prior.map(toSkillSession),
  };

  const stdout = await runSkill(JSON.stringify(payload));
  return fromSkillSession(JSON.parse(stdout) as SkillSession);
}

type SkillSession = {
  id: string;
  recorded_at: string;
  date: string;
  window: string;
  aborted: boolean;
  composite: number | null;
  core_recall: number | null;
  detail_recall: number | null;
  intrusion_rate: number | null;
  confounders: { poor_sleep: boolean; unwell_or_alcohol: boolean };
  trend: {
    n_prior: number;
    n_prior_clean: number;
    baseline_mean: number | null;
    baseline_sd: number | null;
    z: number | null;
    flag: string;
  };
};

function toSkillSession(session: SessionRecord) {
  return {
    aborted: session.aborted,
    composite: session.composite,
    confounders: {
      poor_sleep: session.confounders.poorSleep,
      unwell_or_alcohol: session.confounders.unwellOrAlcohol,
    },
    trend: {
      n_prior: session.trend.nPrior,
      n_prior_clean: session.trend.nPriorClean,
      baseline_mean: session.trend.baselineMean,
      baseline_sd: session.trend.baselineSd,
      z: session.trend.z,
      flag: session.trend.flag,
    },
  };
}

function fromSkillSession(session: SkillSession): SessionRecord {
  if (!FLAGS.has(session.trend.flag as TrendFlag)) {
    throw new Error("Session record refused.");
  }
  return {
    id: session.id,
    recordedAt: session.recorded_at,
    date: session.date,
    window: session.window,
    aborted: session.aborted,
    composite: session.composite,
    coreRecall: session.core_recall,
    detailRecall: session.detail_recall,
    intrusionRate: session.intrusion_rate,
    confounders: {
      poorSleep: session.confounders.poor_sleep,
      unwellOrAlcohol: session.confounders.unwell_or_alcohol,
    },
    trend: {
      nPrior: session.trend.n_prior,
      nPriorClean: session.trend.n_prior_clean,
      baselineMean: session.trend.baseline_mean,
      baselineSd: session.trend.baseline_sd,
      z: session.trend.z,
      flag: session.trend.flag as TrendFlag,
    },
  };
}

function runSkill(body: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("python3", [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Session record refused."));
    }, 5000);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Session record refused."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error("Session record refused."));
        return;
      }
      resolve(Buffer.concat(out).toString("utf8"));
    });
    child.stdin.write(body);
    child.stdin.end();
    void err;
  });
}
