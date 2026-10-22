import { createHmac } from "crypto";

export function nudgeSalt() {
  const salt = process.env.NUDGE_SALT ?? "";
  return salt.length >= 32 ? salt : null;
}

export function drawRandU(input: {
  ruleId: string;
  version: number;
  userId: string;
  triggerKey: string;
  salt: string;
}) {
  const digest = createHmac("sha256", input.salt)
    .update(`${input.ruleId}|${input.version}|${input.userId}|${input.triggerKey}`)
    .digest();
  return Number(digest.readBigUInt64BE(0)) / 2 ** 64;
}
