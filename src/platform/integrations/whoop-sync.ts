import { createHmac, timingSafeEqual } from "crypto";

import { db, ready } from "@/src/platform/db";
import { accessTokenFor } from "@/src/platform/integrations/whoop";
import { getConnection } from "@/src/platform/integrations/store";
import { readSecrets } from "@/src/platform/integrations/secrets";
import { loadRows } from "@/src/platform/warehouse/load";
import { ensureTables } from "@/src/platform/warehouse/tables";
import { memberKey } from "@/src/platform/warehouse/member-key";
import { writeSync } from "@/src/platform/warehouse/sync-state";
import { warehouseEnabled } from "@/src/platform/warehouse/client";

const API = "https://api.prod.whoop.com/developer";
const PAGE = "25";

export type WhoopSource = "backfill" | "daily" | "webhook";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchCollection(
  token: string,
  path: string,
  window: { start: string; end: string },
  fetchImpl: FetchLike = fetch,
) {
  const records: Record<string, unknown>[] = [];
  let next: string | null = null;
  do {
    const params = new URLSearchParams({
      limit: PAGE,
      start: window.start,
      end: window.end,
    });
    if (next) {
      params.set("nextToken", next);
    }
    const page = await getJson(token, `${path}?${params.toString()}`, fetchImpl);
    const batch = Array.isArray(page.records) ? page.records : [];
    records.push(
      ...batch.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      ),
    );
    next = typeof page.next_token === "string" && page.next_token ? page.next_token : null;
  } while (next);
  return records;
}

async function getJson(token: string, path: string, fetchImpl: FetchLike, attempt = 0): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 429 && attempt < 5) {
    const header = response.headers.get("retry-after");
    const retry = header === null ? Number.NaN : Number(header);
    const wait = Number.isFinite(retry) && retry >= 0 ? retry * 1000 : 2 ** attempt * 500;
    await new Promise((resolve) => setTimeout(resolve, wait));
    return getJson(token, path, fetchImpl, attempt + 1);
  }
  if (response.status === 429) {
    throw new Error("WHOOP 429");
  }
  if (!response.ok) {
    throw new Error(`WHOOP request failed (${response.status}).`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export function stripUserId(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUserId);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "user_id" || key === "userId") {
      continue;
    }
    next[key] = stripUserId(child);
  }
  return next;
}

export function whoopSignature(secret: string, timestamp: string, raw: string) {
  return createHmac("sha256", secret).update(`${timestamp}${raw}`).digest("base64");
}

export function signatureMatches(secret: string, timestamp: string, raw: string, given: string) {
  const expected = whoopSignature(secret, timestamp, raw);
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  return left.length === right.length && timingSafeEqual(left, right);
}

function rowFrom(record: Record<string, unknown>, member: string, source: WhoopSource, recordId: string) {
  return {
    member_key: member,
    record_id: recordId,
    record_updated_at: stamp(record.updated_at ?? record.created_at),
    start_at: stamp(record.start),
    end_at: stamp(record.end),
    timezone_offset: typeof record.timezone_offset === "string" ? record.timezone_offset : null,
    score_state: typeof record.score_state === "string" ? record.score_state : null,
    deleted: false,
    payload: stripUserId(record),
    source,
    ingested_at: new Date().toISOString(),
  };
}

function stamp(value: unknown) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function idOf(record: Record<string, unknown>, fallback: string) {
  const id = record[fallback] ?? record.id;
  return id === undefined || id === null ? "" : String(id);
}

export function syncAllowed(input: { consented: boolean; connected: boolean }) {
  return input.consented && input.connected;
}

export function parseWhoopWebhook(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const row = body as Record<string, unknown>;
  const id = row.id;
  const type = row.type;
  const user = row.user_id;
  if ((typeof id !== "string" && typeof id !== "number") || typeof type !== "string") {
    return null;
  }
  if (typeof user !== "string" && typeof user !== "number") {
    return null;
  }
  return { id: String(id), type, userId: String(user) };
}

async function fetchRecord(token: string, path: string, fetchImpl: FetchLike) {
  try {
    return await getJson(token, path, fetchImpl);
  } catch (error) {
    if (error instanceof Error && error.message.includes("(404)")) {
      return null;
    }
    throw error;
  }
}

export async function rowsForWebhook(
  token: string,
  event: { id: string; type: string },
  member: string,
  fetchImpl: FetchLike = fetch,
) {
  const [kind, action] = event.type.split(".");
  const table =
    kind === "sleep" ? "whoop_sleep" : kind === "workout" ? "whoop_workout" : kind === "recovery" ? "whoop_recovery" : "";
  if (!table) {
    return null;
  }
  if (action === "deleted") {
    let recordId = event.id;
    if (kind === "recovery") {
      const sleep = await fetchRecord(token, `/v2/activity/sleep/${event.id}`, fetchImpl);
      const cycle = sleep?.cycle_id;
      if (cycle !== undefined && cycle !== null) {
        recordId = String(cycle);
      }
    }
    return { table, row: tombstone(member, recordId) };
  }
  if (action !== "updated") {
    return null;
  }
  if (kind === "sleep" || kind === "workout") {
    const path = kind === "sleep" ? `/v2/activity/sleep/${event.id}` : `/v2/activity/workout/${event.id}`;
    const record = await fetchRecord(token, path, fetchImpl);
    if (!record) {
      return null;
    }
    return { table, row: rowFrom(record, member, "webhook", idOf(record, "id")) };
  }
  const sleep = await fetchRecord(token, `/v2/activity/sleep/${event.id}`, fetchImpl);
  const cycle = sleep?.cycle_id;
  if (cycle === undefined || cycle === null) {
    return null;
  }
  const record = await fetchRecord(token, `/v2/cycle/${cycle}/recovery`, fetchImpl);
  if (!record) {
    return null;
  }
  return { table, row: rowFrom(record, member, "webhook", idOf(record, "cycle_id")) };
}

export async function loadRowsForWebhook(
  userId: string,
  event: { id: string; type: string },
  token: string,
) {
  if (!warehouseEnabled()) {
    console.info(JSON.stringify({ warehouse: "skipped", stream: "whoop-webhook" }));
    return;
  }
  await ensureTables();
  const built = await rowsForWebhook(token, event, memberKey(userId));
  if (!built || !built.row.record_id) {
    return;
  }
  await loadRows("ordinary_raw", built.table, [built.row]);
}

export async function syncMember(
  userId: string,
  input: { start: string; end: string; source: WhoopSource },
  fetchImpl?: FetchLike,
) {
  if (!warehouseEnabled()) {
    console.info(JSON.stringify({ warehouse: "skipped", stream: "whoop" }));
    return { cycles: 0, recoveries: 0, sleeps: 0, workouts: 0 };
  }
  const consented = await hasConsent(userId);
  const connection = await getConnection(userId, "whoop");
  if (!connection || !syncAllowed({ consented, connected: true })) {
    return { cycles: 0, recoveries: 0, sleeps: 0, workouts: 0 };
  }
  const token = await accessTokenFor(connection);
  if (!token) {
    await writeSync({ stream: "whoop", scope: userId, error: "WHOOP needs to be connected again." });
    return { cycles: 0, recoveries: 0, sleeps: 0, workouts: 0 };
  }
  try {
    const key = memberKey(userId);
    const [cycles, recoveries, sleeps, workouts] = await Promise.all([
      fetchCollection(token, "/v2/cycle", input, fetchImpl),
      fetchCollection(token, "/v2/recovery", input, fetchImpl),
      fetchCollection(token, "/v2/activity/sleep", input, fetchImpl),
      fetchCollection(token, "/v2/activity/workout", input, fetchImpl),
    ]);
    await loadRows("ordinary_raw", "whoop_cycle", cycles.map((item) => rowFrom(item, key, input.source, idOf(item, "id"))).filter((row) => row.record_id));
    await loadRows("ordinary_raw", "whoop_recovery", recoveries.map((item) => rowFrom(item, key, input.source, idOf(item, "cycle_id"))).filter((row) => row.record_id));
    await loadRows("ordinary_raw", "whoop_sleep", sleeps.map((item) => rowFrom(item, key, input.source, idOf(item, "id"))).filter((row) => row.record_id));
    await loadRows("ordinary_raw", "whoop_workout", workouts.map((item) => rowFrom(item, key, input.source, idOf(item, "id"))).filter((row) => row.record_id));
    await writeSync({ stream: "whoop", scope: userId, cursor: input.end, success: true, error: null });
    return {
      cycles: cycles.length,
      recoveries: recoveries.length,
      sleeps: sleeps.length,
      workouts: workouts.length,
    };
  } catch (error) {
    await writeSync({
      stream: "whoop",
      scope: userId,
      error: error instanceof Error ? error.message : "WHOOP sync failed.",
    });
    throw error;
  }
}

export async function consentedWhoopMembers() {
  await ready();
  const rows = await db()`
    select m.id::text as id
    from members m
    join consents c on c.user_id = m.id
    join connections k on k.user_id = m.id and k.provider = 'whoop'
    where c.health_accepted_at is not null
  `;
  return rows.map((row) => String(row.id));
}

async function hasConsent(userId: string) {
  await ready();
  const rows = await db()`
    select 1 from consents
    where user_id = ${userId} and health_accepted_at is not null
    limit 1
  `;
  return rows.length > 0;
}

export async function memberForWhoopUser(providerUserId: string) {
  await ready();
  const rows = await db()`
    select k.user_id::text as id
    from connections k
    join consents c on c.user_id = k.user_id
    where k.provider = 'whoop'
      and k.provider_user_id = ${providerUserId}
      and c.health_accepted_at is not null
    limit 1
  `;
  return rows[0] ? String(rows[0].id) : null;
}

export async function clientSecretFor(userId: string) {
  const saved = await readSecrets(userId, "whoop");
  return saved.get("client_secret") || process.env.WHOOP_CLIENT_SECRET || "";
}

export function tombstone(member: string, recordId: string) {
  return {
    member_key: member,
    record_id: recordId,
    record_updated_at: new Date().toISOString(),
    start_at: null,
    end_at: null,
    timezone_offset: null,
    score_state: null,
    deleted: true,
    payload: null,
    source: "webhook",
    ingested_at: new Date().toISOString(),
  };
}
