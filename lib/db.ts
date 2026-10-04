import postgres, { type Sql } from "postgres";

const globalDb = globalThis as unknown as {
  membershipSql?: Sql;
  membershipReady?: Promise<void>;
};

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

const SCHEMA = `
create table if not exists members (
  id uuid primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists connections (
  user_id uuid not null references members (id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  scopes text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  primary key (user_id, provider)
);
`;

function databaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new StoreError("Add DATABASE_URL before signing in.");
  }
  return url;
}

export function db() {
  if (!globalDb.membershipSql) {
    globalDb.membershipSql = postgres(databaseUrl(), {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalDb.membershipSql;
}

export function ready() {
  if (!globalDb.membershipReady) {
    globalDb.membershipReady = migrate().catch((error) => {
      globalDb.membershipReady = undefined;
      throw error;
    });
  }
  return globalDb.membershipReady;
}

async function migrate() {
  try {
    await db().unsafe(SCHEMA);
  } catch (error) {
    if (error instanceof StoreError) {
      throw error;
    }
    console.error(
      "membership database",
      error instanceof Error ? error.message : error,
    );
    throw new StoreError("The membership database could not be reached.");
  }
}
