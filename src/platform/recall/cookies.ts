import { cookies } from "next/headers";

import {
  openSealed,
  seal,
  sessionCookieOptions,
  sessionSecret,
} from "@/src/platform/session";

const DRAFT = "recall_draft";
const PENDING = "recall_pending";
const REVEAL = "recall_reveal";
const ATTEMPTS = "recall_attempts";

type Expiring = { exp: number };

export type SignupDraft = Expiring & {
  name: string;
  email: string;
  passwordHash: string;
};

export type PendingSignup = Expiring & { userId: string };

export type RevealPayload = Expiring & {
  missed: { type: string; text: string }[];
};

async function write<T extends Expiring>(name: string, payload: T, maxAge: number) {
  const secret = sessionSecret();
  if (!secret) {
    return false;
  }
  const jar = await cookies();
  jar.set(name, await seal(payload, secret), sessionCookieOptions(maxAge));
  return true;
}

async function read<T extends Expiring>(name: string): Promise<T | null> {
  const secret = sessionSecret();
  if (!secret) {
    return null;
  }
  const jar = await cookies();
  const payload = await openSealed<T>(jar.get(name)?.value, secret);
  if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now()) {
    return null;
  }
  return payload;
}

async function clear(name: string) {
  const jar = await cookies();
  jar.set(name, "", sessionCookieOptions(0));
}

export async function writeDraft(draft: Omit<SignupDraft, "exp">) {
  return write(
    DRAFT,
    { ...draft, exp: Date.now() + 30 * 60 * 1000 },
    30 * 60,
  );
}

export async function readDraft() {
  const draft = await read<SignupDraft>(DRAFT);
  if (!draft?.name || !draft.email || !draft.passwordHash) {
    return null;
  }
  return draft;
}

export async function clearDraft() {
  await clear(DRAFT);
}

export async function writePending(userId: string) {
  return write(
    PENDING,
    { userId, exp: Date.now() + 24 * 60 * 60 * 1000 },
    24 * 60 * 60,
  );
}

export async function readPending() {
  const pending = await read<PendingSignup>(PENDING);
  if (!pending?.userId) {
    return null;
  }
  return pending;
}

export async function clearPending() {
  await clear(PENDING);
}

export async function writeReveal(missed: RevealPayload["missed"]) {
  return write(
    REVEAL,
    { missed, exp: Date.now() + 10 * 60 * 1000 },
    10 * 60,
  );
}

export async function readReveal() {
  return read<RevealPayload>(REVEAL);
}

export async function clearReveal() {
  await clear(REVEAL);
}

export async function readAttempts() {
  const payload = await read<Expiring & { count: number }>(ATTEMPTS);
  return payload?.count ?? 0;
}

export async function writeAttempts(count: number) {
  await write(
    ATTEMPTS,
    { count, exp: Date.now() + 15 * 60 * 1000 },
    15 * 60,
  );
}

export async function clearAttempts() {
  await clear(ATTEMPTS);
}
