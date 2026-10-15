import { randomBytes, randomUUID } from "crypto";

import { hashPassword, verifyPassword } from "@/src/platform/password";
import { db, ready, StoreError } from "@/src/platform/db";
import { recallDefaults, type OnboardingStep } from "@/src/platform/recall/defaults";
import type {
  MicStatus,
  RecallProfile,
  RecallSettings,
  SessionRecord,
  TrendFlag,
} from "@/src/platform/recall/types";

type MemberAuthRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  email_verified_at: Date | string | null;
  onboarding_step: string;
  onboarded_at: Date | string | null;
  failed_logins: number;
  locked_until: Date | string | null;
};

const EMPTY_CONSENT = {
  termsVersion: null,
  termsAcceptedAt: null,
  privacyVersion: null,
  privacyAcceptedAt: null,
  healthVersion: null,
  healthAcceptedAt: null,
};

const DEFAULT_SETTINGS: RecallSettings = {
  dayCapture: recallDefaults.dayCaptureDefault,
  pausedUntil: null,
  micStatus: "unknown",
  beeEnabled: false,
  reminderEnabled: false,
  reminderTime: recallDefaults.reminderDefault,
  reminderChannel: "email",
};

export async function createPendingMember(input: {
  name: string;
  email: string;
  passwordHash: string;
}) {
  await ready();
  const email = input.email.trim().toLowerCase();
  const id = randomUUID();
  try {
    await db()`
      insert into members (id, email, name, password_hash, email_verified_at, onboarding_step)
      values (${id}, ${email}, ${input.name.trim()}, ${input.passwordHash}, null, 'privacy')
    `;
  } catch (error) {
    if (isUnique(error)) {
      throw new StoreError("You already have an account with this email.");
    }
    throw error;
  }

  await db()`
    insert into consents (
      user_id,
      terms_version,
      terms_accepted_at,
      privacy_version,
      privacy_accepted_at
    )
    values (
      ${id},
      ${recallDefaults.termsVersion},
      now(),
      ${recallDefaults.privacyVersion},
      now()
    )
  `;
  await db()`
    insert into recall_settings (user_id)
    values (${id})
    on conflict (user_id) do nothing
  `;
  return { id, email, name: input.name.trim() };
}

export async function issueEmailToken(
  userId: string,
  email: string,
  purpose: "verify" | "reset",
) {
  await ready();
  const latest = await db()`
    select created_at
    from email_tokens
    where user_id = ${userId}
      and purpose = ${purpose}
      and used_at is null
    order by created_at desc
    limit 1
  `;
  const createdAt = latest[0]?.created_at
    ? new Date(latest[0].created_at as string | Date).getTime()
    : 0;
  const retryIn = Math.ceil(
    (createdAt + recallDefaults.resendCooldownSeconds * 1000 - Date.now()) /
      1000,
  );
  if (retryIn > 0) {
    return { retryIn, token: null as string | null };
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(
    Date.now() + recallDefaults.verifyTtlHours * 60 * 60 * 1000,
  );
  await db()`
    insert into email_tokens (token, user_id, email, purpose, expires_at)
    values (${token}, ${userId}, ${email}, ${purpose}, ${expires})
  `;
  return { retryIn: 0, token };
}

export async function latestEmailToken(userId: string, purpose: "verify" | "reset") {
  await ready();
  const rows = await db()`
    select token, created_at, expires_at, used_at
    from email_tokens
    where user_id = ${userId} and purpose = ${purpose}
    order by created_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    token: String(row.token),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    used: Boolean(row.used_at),
    expiresAt: new Date(row.expires_at as string | Date).toISOString(),
  };
}

export async function consumeEmailToken(token: string, purpose: "verify" | "reset") {
  await ready();
  const rows = await db()`
    select user_id, email, expires_at, used_at
    from email_tokens
    where token = ${token} and purpose = ${purpose}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return { status: "invalid" as const };
  }
  const usedAt = row.used_at ? new Date(row.used_at as string | Date).getTime() : 0;
  const expired = new Date(row.expires_at as string | Date).getTime() < Date.now();
  if (usedAt && Date.now() - usedAt < 2 * 60 * 1000 && !expired) {
    return {
      status: "ok" as const,
      userId: String(row.user_id),
      email: String(row.email),
    };
  }
  if (usedAt || expired) {
    return { status: "expired" as const, email: String(row.email) };
  }
  await db()`
    update email_tokens set used_at = now() where token = ${token}
  `;
  return {
    status: "ok" as const,
    userId: String(row.user_id),
    email: String(row.email),
  };
}

export async function markEmailVerified(userId: string) {
  await ready();
  await db()`
    update members
    set email_verified_at = coalesce(email_verified_at, now())
    where id = ${userId}
  `;
}

export async function changePendingEmail(userId: string, email: string) {
  await ready();
  const next = email.trim().toLowerCase();
  try {
    const rows = await db()`
      update members
      set email = ${next}
      where id = ${userId} and email_verified_at is null
      returning id
    `;
    if (rows.length === 0) {
      throw new StoreError("That email can't be changed now.");
    }
  } catch (error) {
    if (isUnique(error)) {
      throw new StoreError("You already have an account with this email.");
    }
    throw error;
  }
  return next;
}

export async function findAuthByEmail(email: string) {
  await ready();
  const rows = (await db()`
    select
      id, email, name, password_hash, email_verified_at, onboarding_step,
      onboarded_at, failed_logins, locked_until
    from members
    where email = ${email.trim().toLowerCase()}
    limit 1
  `) as MemberAuthRow[];
  return rows[0] ?? null;
}

export function passwordMatches(password: string, hash: string) {
  return verifyPassword(password, hash);
}

export function lockActive(row: { locked_until: Date | string | null }) {
  if (!row.locked_until) {
    return false;
  }
  return new Date(row.locked_until).getTime() > Date.now();
}

export async function recordFailedLogin(userId: string) {
  await ready();
  const rows = await db()`
    update members
    set
      failed_logins = failed_logins + 1,
      locked_until = case
        when failed_logins + 1 >= ${recallDefaults.loginAttemptLimit}
          then now() + (${recallDefaults.loginLockMinutes} || ' minutes')::interval
        else locked_until
      end
    where id = ${userId}
    returning failed_logins, locked_until
  `;
  const row = rows[0];
  return {
    locked: row?.locked_until
      ? new Date(row.locked_until as string | Date).getTime() > Date.now()
      : false,
  };
}

export async function clearFailedLogins(userId: string) {
  await ready();
  await db()`
    update members
    set failed_logins = 0, locked_until = null
    where id = ${userId}
  `;
}

export async function setPassword(userId: string, password: string) {
  await ready();
  await db()`
    update members
    set password_hash = ${hashPassword(password)}, failed_logins = 0, locked_until = null
    where id = ${userId}
  `;
}

export async function getRecallProfile(userId: string): Promise<RecallProfile | null> {
  await ready();
  const members = (await db()`
    select id, email, name, email_verified_at, onboarding_step, onboarded_at
    from members
    where id = ${userId}
    limit 1
  `) as MemberAuthRow[];
  const member = members[0];
  if (!member) {
    return null;
  }

  const consents = await db()`
    select
      terms_version, terms_accepted_at, privacy_version, privacy_accepted_at,
      health_version, health_accepted_at
    from consents
    where user_id = ${userId}
    limit 1
  `;
  const settings = await db()`
    select
      day_capture, day_capture_paused_until, mic_status, bee_enabled,
      reminder_enabled, reminder_time, reminder_channel
    from recall_settings
    where user_id = ${userId}
    limit 1
  `;
  if (settings.length === 0) {
    await db()`
      insert into recall_settings (user_id)
      values (${userId})
      on conflict (user_id) do nothing
    `;
  }
  const consent = consents[0];
  const setting = settings[0];

  return {
    id: member.id,
    email: member.email,
    name: member.name,
    emailVerifiedAt: iso(member.email_verified_at),
    step: member.onboarding_step,
    onboardedAt: iso(member.onboarded_at),
    consent: consent
      ? {
          termsVersion: text(consent.terms_version),
          termsAcceptedAt: iso(consent.terms_accepted_at),
          privacyVersion: text(consent.privacy_version),
          privacyAcceptedAt: iso(consent.privacy_accepted_at),
          healthVersion: text(consent.health_version),
          healthAcceptedAt: iso(consent.health_accepted_at),
        }
      : EMPTY_CONSENT,
    settings: setting
      ? {
          dayCapture: Boolean(setting.day_capture),
          pausedUntil: iso(setting.day_capture_paused_until),
          micStatus: micStatus(setting.mic_status),
          beeEnabled: Boolean(setting.bee_enabled),
          reminderEnabled: Boolean(setting.reminder_enabled),
          reminderTime: String(setting.reminder_time ?? recallDefaults.reminderDefault),
          reminderChannel:
            setting.reminder_channel === "notification" ? "notification" : "email",
        }
      : DEFAULT_SETTINGS,
  };
}

export async function saveHealthConsent(userId: string, resumeDone: boolean) {
  await ready();
  await db()`
    insert into consents (user_id, health_version, health_accepted_at)
    values (${userId}, ${recallDefaults.healthVersion}, now())
    on conflict (user_id) do update
    set health_version = ${recallDefaults.healthVersion},
        health_accepted_at = now()
  `;
  const step: OnboardingStep = resumeDone ? "done" : "microphone";
  await setStep(userId, step);
  return step;
}

export async function withdrawHealthConsent(userId: string) {
  await ready();
  await db()`
    update consents
    set health_accepted_at = null
    where user_id = ${userId}
  `;
  await setStep(userId, "privacy");
}

export async function setStep(userId: string, step: OnboardingStep) {
  await ready();
  if (step === "done") {
    await db()`
      update members
      set onboarding_step = 'done',
          onboarded_at = coalesce(onboarded_at, now())
      where id = ${userId}
    `;
    return;
  }
  await db()`
    update members set onboarding_step = ${step} where id = ${userId}
  `;
}

export async function updateMicStatus(userId: string, micStatus: MicStatus) {
  await ready();
  await db()`
    insert into recall_settings (user_id, mic_status)
    values (${userId}, ${micStatus})
    on conflict (user_id) do update
    set mic_status = ${micStatus}
  `;
}

export async function saveMicStep(
  userId: string,
  input: { micStatus: MicStatus; dayCapture: boolean },
) {
  await ready();
  await db()`
    insert into recall_settings (user_id, mic_status, day_capture)
    values (${userId}, ${input.micStatus}, ${input.dayCapture})
    on conflict (user_id) do update
    set mic_status = ${input.micStatus},
        day_capture = ${input.dayCapture}
  `;
  await setStep(userId, "bee");
}

export async function saveBeeChoice(userId: string, enabled: boolean) {
  await ready();
  await db()`
    insert into recall_settings (user_id, bee_enabled)
    values (${userId}, ${enabled})
    on conflict (user_id) do update
    set bee_enabled = ${enabled}
  `;
}

export async function updateDayCapture(userId: string, enabled: boolean) {
  await ready();
  await db()`
    insert into recall_settings (user_id, day_capture, day_capture_paused_until)
    values (${userId}, ${enabled}, null)
    on conflict (user_id) do update
    set day_capture = ${enabled},
        day_capture_paused_until = null
  `;
}

export async function pauseDayCapture(userId: string, until: Date) {
  await ready();
  await db()`
    update recall_settings
    set day_capture_paused_until = ${until}
    where user_id = ${userId}
  `;
}

export async function saveReminder(
  userId: string,
  input: { time: string; enabled: boolean; channel: "email" | "notification" },
) {
  await ready();
  await db()`
    insert into recall_settings (user_id, reminder_time, reminder_enabled, reminder_channel)
    values (${userId}, ${input.time}, ${input.enabled}, ${input.channel})
    on conflict (user_id) do update
    set reminder_time = ${input.time},
        reminder_enabled = ${input.enabled},
        reminder_channel = ${input.channel}
  `;
}

export async function listSessions(userId: string): Promise<SessionRecord[]> {
  await ready();
  const rows = await db()`
    select
      id, recorded_at, session_date, day_window, aborted, composite,
      core_recall, detail_recall, intrusion_rate, poor_sleep, unwell_or_alcohol,
      n_prior, n_prior_clean, baseline_mean, baseline_sd, z_score, trend_flag
    from recall_sessions
    where user_id = ${userId}
    order by recorded_at asc
  `;
  return rows.map(mapSession);
}

export async function insertSession(userId: string, session: SessionRecord) {
  await ready();
  await db()`
    insert into recall_sessions (
      id, user_id, recorded_at, session_date, day_window, aborted, composite,
      core_recall, detail_recall, intrusion_rate, poor_sleep, unwell_or_alcohol,
      n_prior, n_prior_clean, baseline_mean, baseline_sd, z_score, trend_flag
    )
    values (
      ${session.id},
      ${userId},
      ${session.recordedAt},
      ${session.date},
      ${session.window},
      ${session.aborted},
      ${session.composite},
      ${session.coreRecall},
      ${session.detailRecall},
      ${session.intrusionRate},
      ${session.confounders.poorSleep},
      ${session.confounders.unwellOrAlcohol},
      ${session.trend.nPrior},
      ${session.trend.nPriorClean},
      ${session.trend.baselineMean},
      ${session.trend.baselineSd},
      ${session.trend.z},
      ${session.trend.flag}
    )
  `;
}

async function ensureTalks() {
  await ready();
  await db()`
    create table if not exists recall_talks (
      session_id uuid primary key references recall_sessions (id) on delete cascade,
      user_id uuid not null references members (id) on delete cascade,
      narrative text not null,
      answers jsonb not null,
      created_at timestamptz not null default now()
    )
  `;
}

export type StoredTalk = {
  id: string;
  narrative: string;
  answers: { id: string; question: string; answer: string }[];
};

export async function listTalks(userId: string): Promise<StoredTalk[]> {
  await ensureTalks();
  const rows = await db()`
    select session_id, narrative, answers
    from recall_talks
    where user_id = ${userId}
    order by created_at asc
  `;
  return rows.map((row) => ({
    id: String(row.session_id),
    narrative: String(row.narrative ?? ""),
    answers: talkAnswers(row.answers),
  }));
}

export async function listTalkNarratives(userId: string) {
  const talks = await listTalks(userId);
  return talks.map((talk) => ({ id: talk.id, narrative: talk.narrative }));
}

export async function insertTalk(
  userId: string,
  sessionId: string,
  narrative: string,
  answers: { id: string; question: string; answer: string }[],
) {
  await ensureTalks();
  await db()`
    insert into recall_talks (session_id, user_id, narrative, answers)
    values (${sessionId}, ${userId}, ${narrative}, ${db().json(answers)})
  `;
}

export async function deleteSessions(userId: string) {
  await ready();
  await db()`delete from recall_sessions where user_id = ${userId}`;
}

export async function deleteAccount(userId: string) {
  await ready();
  await db()`delete from members where id = ${userId}`;
}

export async function sendVerificationEmail(email: string, url: string) {
  if (process.env.NODE_ENV !== "production") {
    console.info("verification link", email, url);
  }
}

function mapSession(row: Record<string, unknown>): SessionRecord {
  const date = row.session_date;
  const dateText =
    date instanceof Date
      ? date.toISOString().slice(0, 10)
      : String(date).slice(0, 10);
  return {
    id: String(row.id),
    recordedAt: new Date(row.recorded_at as string | Date).toISOString(),
    date: dateText,
    window: String(row.day_window),
    aborted: Boolean(row.aborted),
    composite: numberOrNull(row.composite),
    coreRecall: numberOrNull(row.core_recall),
    detailRecall: numberOrNull(row.detail_recall),
    intrusionRate: numberOrNull(row.intrusion_rate),
    confounders: {
      poorSleep: Boolean(row.poor_sleep),
      unwellOrAlcohol: Boolean(row.unwell_or_alcohol),
    },
    trend: {
      nPrior: Number(row.n_prior ?? 0),
      nPriorClean: Number(row.n_prior_clean ?? 0),
      baselineMean: numberOrNull(row.baseline_mean),
      baselineSd: numberOrNull(row.baseline_sd),
      z: numberOrNull(row.z_score),
      flag: trendFlag(row.trend_flag),
    },
  };
}

function trendFlag(value: unknown): TrendFlag {
  if (
    value === "insufficient_baseline" ||
    value === "within_range" ||
    value === "above_range" ||
    value === "below_range" ||
    value === "review_suggested"
  ) {
    return value;
  }
  return "insufficient_baseline";
}

function micStatus(value: unknown): MicStatus {
  if (
    value === "granted" ||
    value === "denied" ||
    value === "missing" ||
    value === "skipped" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

function iso(value: unknown) {
  if (!value) {
    return null;
  }
  const date = new Date(value as string | Date);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function ensureChat() {
  await ready();
  await db()`
    create table if not exists recall_chat (
      id uuid primary key,
      user_id uuid not null references members (id) on delete cascade,
      role text not null,
      body text not null,
      created_at timestamptz not null default now()
    )
  `;
}

export type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  body: string;
};

export async function listChat(userId: string): Promise<ChatTurn[]> {
  await ensureChat();
  const rows = await db()`
    select id, role, body
    from recall_chat
    where user_id = ${userId}
    order by created_at asc
    limit 40
  `;
  return rows.flatMap((row) => {
    const role = row.role === "assistant" ? "assistant" : row.role === "user" ? "user" : null;
    if (!role) {
      return [];
    }
    return [{ id: String(row.id), role, body: String(row.body ?? "") }];
  });
}

export async function insertChat(
  userId: string,
  role: "user" | "assistant",
  body: string,
) {
  await ensureChat();
  const id = randomUUID();
  await db()`
    insert into recall_chat (id, user_id, role, body)
    values (${id}, ${userId}, ${role}, ${body})
  `;
  return id;
}

function talkAnswers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) {
      return [];
    }
    return [
      {
        id,
        question: typeof row.question === "string" ? row.question : "",
        answer: typeof row.answer === "string" ? row.answer : "",
      },
    ];
  });
}

function isUnique(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
