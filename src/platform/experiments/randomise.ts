import { createHmac } from "crypto";

export function experimentSalt() {
  const salt = process.env.EXPERIMENT_SALT ?? "";
  if (salt.length < 32) {
    throw new Error("EXPERIMENT_SALT must be at least 32 characters.");
  }
  return salt;
}

export function randomise(input: {
  experimentId: string;
  version: number;
  userId: string;
  decisionDate: string;
  treatmentProbability: number;
  salt?: string;
}) {
  const salt = input.salt ?? experimentSalt();
  const digest = createHmac("sha256", salt)
    .update(`${input.experimentId}|${input.version}|${input.userId}|${input.decisionDate}`)
    .digest();
  const randU = Number(digest.readBigUInt64BE(0)) / 2 ** 64;
  return {
    randU,
    probability: input.treatmentProbability,
    arm: randU < input.treatmentProbability ? "treatment" : "control",
  };
}
