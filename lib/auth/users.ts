import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";

import { readJsonFile, writeJsonFile } from "@/lib/data-file";

const USERS_FILE = "users.json";

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
};

type UserFile = {
  users: StoredUser[];
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
};

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<PublicUser> {
  const file = await readUsers();
  const email = input.email.trim().toLowerCase();
  if (file.users.some((user) => user.email === email)) {
    throw new Error("An account with that email already exists.");
  }

  const user: StoredUser = {
    id: randomUUID(),
    email,
    name: input.name.trim(),
    passwordHash: hashPassword(input.password),
    createdAt: new Date().toISOString(),
  };
  file.users.push(user);
  await writeJsonFile(USERS_FILE, file);
  return { id: user.id, email: user.email, name: user.name };
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const file = await readUsers();
  const user = file.users.find(
    (entry) => entry.email === email.trim().toLowerCase(),
  );
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return { id: user.id, email: user.email, name: user.name };
}

export async function findUserById(id: string): Promise<PublicUser | null> {
  const file = await readUsers();
  const user = file.users.find((entry) => entry.id === id);
  if (!user) {
    return null;
  }
  return { id: user.id, email: user.email, name: user.name };
}

async function readUsers(): Promise<UserFile> {
  const file = await readJsonFile<UserFile>(USERS_FILE, { users: [] });
  if (!file || !Array.isArray(file.users)) {
    return { users: [] };
  }
  return file;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}
