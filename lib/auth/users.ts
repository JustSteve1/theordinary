import { randomUUID } from "crypto";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db, ready, StoreError } from "@/lib/db";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
};

type MemberRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
};

let seeded: Promise<void> | undefined;

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<PublicUser> {
  await prepare();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const id = randomUUID();

  try {
    await db()`
      insert into members (id, email, name, password_hash)
      values (${id}, ${email}, ${name}, ${hashPassword(input.password)})
    `;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new StoreError("An account with that email already exists.");
    }
    throw error;
  }

  return { id, email, name };
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  await prepare();
  const rows = (await db()`
    select id, email, name, password_hash
    from members
    where email = ${email.trim().toLowerCase()}
    limit 1
  `) as MemberRow[];
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return null;
  }
  return { id: user.id, email: user.email, name: user.name };
}

export async function findUserById(id: string): Promise<PublicUser | null> {
  await prepare();
  const rows = (await db()`
    select id, email, name, password_hash
    from members
    where id = ${id}
    limit 1
  `) as MemberRow[];
  const user = rows[0];
  if (!user) {
    return null;
  }
  return { id: user.id, email: user.email, name: user.name };
}

async function prepare() {
  await ready();
  if (!seeded) {
    seeded = seedFirstMember().catch((error) => {
      seeded = undefined;
      throw error;
    });
  }
  await seeded;
}

async function seedFirstMember() {
  const password = process.env.USER1_PASSWORD?.trim();
  if (!password || password.length < 8) {
    return;
  }
  const email = (process.env.USER1_EMAIL || "steve@440hz.uk")
    .trim()
    .toLowerCase();
  const name = (process.env.USER1_NAME || "Steve Fortuin").trim();
  if (!email || !name) {
    return;
  }

  await db()`
    insert into members (id, email, name, password_hash)
    values (
      ${randomUUID()},
      ${email},
      ${name},
      ${hashPassword(password)}
    )
    on conflict (email) do nothing
  `;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
