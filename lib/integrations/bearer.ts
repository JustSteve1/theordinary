import { timingSafeEqual } from "crypto";

export function bearerAuthorized(header: string | null, secret: string) {
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : "";
  const received = Buffer.from(token);
  const expected = Buffer.from(secret);
  if (received.length !== expected.length || received.length === 0) {
    return false;
  }
  return timingSafeEqual(received, expected);
}
