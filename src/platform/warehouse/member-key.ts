import { createHmac } from "crypto";

export function memberKey(userId: string) {
  const secret = process.env.MEMBER_KEY_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("MEMBER_KEY_SECRET must be at least 32 characters.");
  }
  return createHmac("sha256", secret).update(userId).digest("hex");
}

export function opaqueId(prefix: "c_" | "s_" | "b_", value: string) {
  return `${prefix}${memberKey(value)}`;
}
