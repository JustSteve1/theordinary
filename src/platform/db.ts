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

create table if not exists integration_secrets (
  user_id uuid not null references members (id) on delete cascade,
  provider text not null,
  name text not null,
  value text not null,
  primary key (user_id, provider, name)
);

alter table members add column if not exists email_verified_at timestamptz;
alter table members add column if not exists onboarding_step text not null default 'privacy';
alter table members add column if not exists onboarded_at timestamptz;
alter table members add column if not exists failed_logins integer not null default 0;
alter table members add column if not exists locked_until timestamptz;

create table if not exists consents (
  user_id uuid primary key references members (id) on delete cascade,
  terms_version text,
  terms_accepted_at timestamptz,
  privacy_version text,
  privacy_accepted_at timestamptz,
  health_version text,
  health_accepted_at timestamptz
);

create table if not exists recall_settings (
  user_id uuid primary key references members (id) on delete cascade,
  day_capture boolean not null default false,
  day_capture_paused_until timestamptz,
  mic_status text not null default 'unknown',
  bee_enabled boolean not null default false,
  reminder_enabled boolean not null default false,
  reminder_time text not null default '10:00',
  reminder_channel text not null default 'email'
);

create table if not exists recall_sessions (
  id uuid primary key,
  user_id uuid not null references members (id) on delete cascade,
  recorded_at timestamptz not null,
  session_date date not null,
  day_window text not null,
  aborted boolean not null default false,
  composite double precision,
  core_recall double precision,
  detail_recall double precision,
  intrusion_rate double precision,
  poor_sleep boolean not null default false,
  unwell_or_alcohol boolean not null default false,
  n_prior integer not null default 0,
  n_prior_clean integer not null default 0,
  baseline_mean double precision,
  baseline_sd double precision,
  z_score double precision,
  trend_flag text not null
);

create table if not exists recall_talks (
  session_id uuid primary key references recall_sessions (id) on delete cascade,
  user_id uuid not null references members (id) on delete cascade,
  narrative text not null,
  answers jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists recall_chat (
  id uuid primary key,
  user_id uuid not null references members (id) on delete cascade,
  role text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists email_tokens (
  token text primary key,
  user_id uuid not null references members (id) on delete cascade,
  email text not null,
  purpose text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table recall_sessions add column if not exists duration_ms integer;
alter table recall_sessions add column if not exists short boolean not null default false;
alter table recall_sessions add column if not exists opener_id text;
alter table recall_sessions add column if not exists follow_up_id text;
alter table recall_sessions add column if not exists item_scores jsonb;

create table if not exists recall_rubric (
  user_id uuid primary key references members (id) on delete cascade,
  items jsonb not null,
  updated_at timestamptz not null default now()
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
