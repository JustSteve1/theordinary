import { db, ready } from "@/src/platform/db";

const LONDON = "Europe/London";

const JOBS: { utcMinutes: number; name: string }[] = [
  { utcMinutes: 6 * 60 + 45, name: "WHOOP sync" },
  { utcMinutes: 7 * 60 + 15, name: "experiment decisions" },
  { utcMinutes: 7 * 60 + 30, name: "morning nudges" },
  { utcMinutes: 8 * 60 + 15, name: "export" },
  { utcMinutes: 9 * 60 + 40, name: "Dataform" },
  { utcMinutes: 11 * 60 + 40, name: "Dataform again" },
];

export type StreamStatus = {
  stream: string;
  lastSuccessAt: Date | null;
  lastError: string | null;
};

export type DatedCount = {
  date: string;
  count: number;
};

export type MorningSnapshot = {
  generatedAt: Date;
  whoopConnected: boolean;
  whoopExpiresAt: Date | null;
  whoopLastSuccessAt: Date | null;
  whoopLastError: string | null;
  streams: StreamStatus[];
  checkins: { targetDate: string; count: number; recordedAt: Date }[];
  sessions: DatedCount[];
  scores: DatedCount[];
  activeExperiments: number;
  decisions: number;
};

export function morningReport(snapshot: MorningSnapshot) {
  const day = londonDay(snapshot.generatedAt);
  const lines = [
    `Written ${londonStamp(snapshot.generatedAt)}.`,
    "",
    aheadText(snapshot.generatedAt),
    "",
    "WHOOP",
    whoopText(snapshot),
    "",
    "Sync",
    ...syncLines(snapshot.streams),
    "",
    "Check-ins",
    ...countLines(snapshot.checkins.map((row) => ({ date: row.targetDate, count: row.count }))),
    "",
    "Sessions",
    ...countLines(snapshot.sessions),
    "",
    "Scores",
    ...countLines(snapshot.scores),
    "",
    "Experiments",
    `${snapshot.activeExperiments} active. ${snapshot.decisions} decisions stored.`,
  ];
  return {
    subject: `Morning report, ${day}`,
    text: lines.join("\n"),
  };
}

export async function loadMorningSnapshot(now = new Date()): Promise<MorningSnapshot> {
  await ready();
  const sql = db();
  const [whoop] = await sql`
    select
      count(*)::int as connected,
      max(expires_at) as expires_at
    from connections
    where provider = 'whoop'
      and refresh_token <> ''
  `;
  const streams = await sql`
    select stream, last_success_at, last_error, updated_at
    from warehouse_sync_state
    order by stream
  `;
  const checkins = await sql`
    select target_date::text as target_date, count(*)::int as count, max(recorded_at) as recorded_at
    from checkins
    where target_date is not null
    group by target_date
    order by target_date desc
    limit 7
  `;
  const sessions = await sql`
    select session_date::text as date, count(*)::int as count
    from recall_sessions
    group by session_date
    order by session_date desc
    limit 7
  `;
  const scores = await sql`
    select (computed_at at time zone 'Europe/London')::date::text as date, count(*)::int as count
    from score_runs
    group by 1
    order by 1 desc
    limit 7
  `;
  const [experiments] = await sql`
    select count(*)::int as count from experiments where status = 'active'
  `;
  const [decisions] = await sql`
    select count(*)::int as count from decision_points
  `;
  const byStream = new Map<string, StreamStatus>();
  for (const row of streams) {
    const stream = String(row.stream);
    const current = byStream.get(stream);
    const success = row.last_success_at ? new Date(row.last_success_at as string | Date) : null;
    const error = row.last_error ? String(row.last_error) : null;
    if (!current || (success && (!current.lastSuccessAt || success > current.lastSuccessAt))) {
      byStream.set(stream, { stream, lastSuccessAt: success, lastError: error });
    }
  }
  return {
    generatedAt: now,
    whoopConnected: Number(whoop?.connected ?? 0) > 0,
    whoopExpiresAt: whoop?.expires_at ? new Date(Number(whoop.expires_at)) : null,
    whoopLastSuccessAt: byStream.get("whoop")?.lastSuccessAt ?? null,
    whoopLastError: byStream.get("whoop")?.lastError ?? null,
    streams: [...byStream.values()].filter((row) => row.stream !== "whoop"),
    checkins: checkins.map((row) => ({
      targetDate: String(row.target_date),
      count: Number(row.count),
      recordedAt: new Date(row.recorded_at as string | Date),
    })),
    sessions: sessions.map((row) => ({ date: String(row.date), count: Number(row.count) })),
    scores: scores.map((row) => ({ date: String(row.date), count: Number(row.count) })),
    activeExperiments: Number(experiments?.count ?? 0),
    decisions: Number(decisions?.count ?? 0),
  };
}

export async function morningReportRecipients() {
  await ready();
  const rows = await db()`
    select m.email
    from members m
    join consents c on c.user_id = m.id
    where c.health_accepted_at is not null
    order by m.email
  `;
  return rows.map((row) => String(row.email));
}

function whoopText(snapshot: MorningSnapshot) {
  if (!snapshot.whoopConnected) {
    return "Not connected. The refresh token is not stored.";
  }
  const expiry = snapshot.whoopExpiresAt
    ? `Access token valid until ${londonStamp(snapshot.whoopExpiresAt)}.`
    : "Access token expiry is missing.";
  const sync = snapshot.whoopLastSuccessAt
    ? `Last successful sync ${londonStamp(snapshot.whoopLastSuccessAt)}.`
    : "No successful sync is stored.";
  const error = snapshot.whoopLastError ? ` Last error: ${snapshot.whoopLastError}` : " No sync error is stored.";
  return `Connected. Refresh token is stored. ${expiry} ${sync}${error}`;
}

function syncLines(streams: StreamStatus[]) {
  if (streams.length === 0) {
    return ["No export streams are stored."];
  }
  return streams.map((row) => {
    const when = row.lastSuccessAt ? londonStamp(row.lastSuccessAt) : "never";
    const error = row.lastError ? ` Error: ${row.lastError}` : "";
    return `${row.stream}: last success ${when}.${error}`;
  });
}

function countLines(rows: DatedCount[]) {
  if (rows.length === 0) {
    return ["None stored."];
  }
  return rows.map((row) => `${row.date}: ${row.count}`);
}

function aheadText(now: Date) {
  const nowUtc = utcMinutes(now);
  const pending = JOBS.filter((job) => job.utcMinutes > nowUtc);
  if (pending.length === 0) {
    return "Today's scheduled jobs have all passed their filed minute. Hobby may still be inside the hour after a minute.";
  }
  const names = pending.map((job) => `${job.name} at ${clock(job.utcMinutes)} UTC`).join(", ");
  return `Still ahead today: ${names}. This mail is filed at 03:30 UTC so it arrives by 05:30 London even when Hobby starts late and after the clocks change. It describes the last finished cycle.`;
}

function utcMinutes(date: Date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function clock(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function londonStamp(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(date);
}

function londonDay(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    day: "numeric",
    month: "short",
  }).format(date);
}
