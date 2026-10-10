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

alter table members add column if not exists timezone text not null default 'Europe/London';

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

create table if not exists bee_briefs (
  user_id uuid primary key references members (id) on delete cascade,
  body text not null,
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key,
  user_id uuid not null references members (id) on delete cascade,
  role text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists skill_sessions (
  id uuid primary key,
  user_id uuid not null references members (id) on delete cascade,
  skill text not null,
  phase text not null,
  target_date date,
  timezone text not null default 'Europe/London',
  confounders jsonb,
  window jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists skill_sessions_one_open
  on skill_sessions (user_id, skill)
  where phase in (
    'consent',
    'confounders',
    'awaiting_capture',
    'recall',
    'followup_1',
    'followup_2',
    'feedback'
  );

create table if not exists skill_work (
  session_id uuid primary key references skill_sessions (id) on delete cascade,
  ground_truth jsonb,
  recall_raw text not null default '',
  reveal_items jsonb
);

create table if not exists skill_results (
  id uuid primary key,
  user_id uuid not null references members (id) on delete cascade,
  session_id uuid references skill_sessions (id) on delete set null,
  skill text not null,
  recorded_at timestamptz not null default now(),
  target_date date,
  window text,
  conversation_ids jsonb not null default '[]'::jsonb,
  aborted boolean not null default false,
  composite double precision,
  core_recall double precision,
  detail_recall double precision,
  intrusion_rate double precision,
  unsure_rate double precision,
  n_truth integer,
  n_core integer,
  n_recall integer,
  per_type_recall jsonb,
  confounders jsonb,
  trend jsonb,
  bee_fact text
);

create table if not exists skill_outbox (
  id uuid primary key,
  user_id uuid not null references members (id) on delete cascade,
  session_id uuid references skill_sessions (id) on delete set null,
  skill text not null,
  body text not null,
  created_at timestamptz not null default now(),
  acked_at timestamptz
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
