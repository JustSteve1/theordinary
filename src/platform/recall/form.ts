import { StoreError } from "@/src/platform/db";
import type { MicStatus } from "@/src/platform/recall/types";

export type FormState = {
  error?: string;
  termsError?: string;
  privacyError?: string;
  code?: "unverified";
  retryIn?: number;
};

export const unreachable =
  "We couldn't reach the server. Nothing was saved. Try again.";

export function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function message(error: unknown) {
  if (error instanceof StoreError) {
    return error.message;
  }
  console.error(error);
  return unreachable;
}

export function appOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function isMicStatus(value: string): value is MicStatus {
  return (
    value === "granted" ||
    value === "denied" ||
    value === "missing" ||
    value === "skipped" ||
    value === "unknown"
  );
}

export function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}
