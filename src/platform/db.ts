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

alter table recall_sessions add column if not exists practice boolean not null default false;

create table if not exists checkins (
  id uuid primary key,
  user_id uuid not null references members (id) on delete cascade,
  session_id uuid references recall_sessions (id) on delete set null,
  recorded_at timestamptz not null,
  target_date date,
  talk_text text not null,
  input_mode text not null default 'voice',
  asr_confidence double precision,
  probes jsonb not null default '[]',
  bee_snapshot jsonb not null default '[]',
  v1_facts jsonb not null default '[]',
  rubric_snapshot jsonb not null default '[]',
  flow_items jsonb,
  prior_non_empty integer not null default 0,
  created_at timestamptz not null default now()
);

alter table checkins add column if not exists bee_export jsonb;

create table if not exists score_runs (
  id uuid primary key,
  checkin_id uuid not null references checkins (id) on delete cascade,
  scorer_version text not null,
  config_hash text not null,
  matcher_tier text not null,
  model_id text,
  prompt_version text,
  computed_at timestamptz not null default now(),
  payload jsonb not null,
  unique (checkin_id, scorer_version, config_hash)
);

create table if not exists warehouse_sync_state (
  stream text not null,
  scope text not null default 'global',
  cursor timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (stream, scope)
);

create table if not exists experiments (
  id text not null,
  version int not null,
  status text not null,
  config jsonb not null,
  config_hash text not null,
  activated_at timestamptz,
  ended_at timestamptz,
  primary key (id, version)
);

create table if not exists experiment_enrolments (
  experiment_id text not null,
  version int not null,
  user_id uuid not null references members (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (experiment_id, version, user_id)
);

create table if not exists decision_points (
  id uuid primary key,
  experiment_id text not null,
  version int not null,
  user_id uuid not null references members (id) on delete cascade,
  decision_date date not null,
  decided_at timestamptz not null default now(),
  available boolean not null,
  unavailable_reason text,
  arm text,
  probability double precision,
  rand_u double precision,
  delivered_at timestamptz,
  channel text,
  response text,
  responded_at timestamptz,
  unique (experiment_id, version, user_id, decision_date)
);

create table if not exists nudges (
  id uuid primary key,
  user_id uuid not null references members (id) on delete cascade,
  rule_id text,
  rule_version int,
  kind text,
  category text,
  trigger text,
  trigger_key text not null,
  decision text not null,
  probability double precision,
  rand_u double precision,
  message_key text,
  params jsonb,
  priority int,
  created_at timestamptz default now(),
  expires_at timestamptz,
  status text not null,
  shown_at timestamptz,
  dismissed_at timestamptz,
  helpful boolean,
  channel text default 'in_app',
  unique (user_id, rule_id, rule_version, trigger_key),
  constraint nudges_decision check (decision in ('send', 'hold')),
  constraint nudges_status check (status in ('held', 'pending', 'shown', 'dismissed', 'expired'))
);

create table if not exists nudge_settings (
  user_id uuid primary key references members (id) on delete cascade,
  enabled boolean not null default true,
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
