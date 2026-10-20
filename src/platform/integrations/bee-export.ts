import { db, ready } from "@/src/platform/db";
import {
  beeRequest,
  resolveBeeAccess,
} from "@/src/platform/integrations/bee";
import { ORDINARY_CHECKIN_PREFIX } from "@/src/platform/integrations/bee-echo";
import { readSecret, writeSecret } from "@/src/platform/integrations/secrets";

export { ORDINARY_CHECKIN_PREFIX, isOrdinaryCheckinText, withoutOrdinaryEchoes } from "@/src/platform/integrations/bee-echo";

export type BeeExportKind = "journal" | "conversation" | "fact";

export type BeeExportStatus = "ok" | "pending" | "declined" | "skipped";

export type BeeExportRecord = {
  kind: BeeExportKind | null;
  remoteId: string | null;
  exportedAt: string | null;
  status: BeeExportStatus;
  error: string | null;
};

export type BeeExportPayload = {
  text: string;
  recordedAt: string;
  targetDate: string | null;
};

export type BeeWriteResult = {
  http: number;
  body: unknown;
};

export const EXPORT_ATTEMPTS: { kind: BeeExportKind; path: string }[] = [
  { kind: "journal", path: "/v1/journals" },
  { kind: "conversation", path: "/v1/conversations" },
  { kind: "fact", path: "/v1/facts" },
];

const SCORE_KEYS = [
  "accuracy",
  "richness",
  "probes",
  "bee_snapshot",
  "v1_facts",
  "rubric",
  "score_runs",
  "dimensions",
  "metrics",
  "trend",
] as const;

export function buildBeeExportPayload(input: {
  talkText: string;
  recordedAt: string;
  targetDate: string | null;
}): BeeExportPayload {
  return {
    text: String(input.talkText ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000),
    recordedAt: input.recordedAt,
    targetDate: input.targetDate,
  };
}

export function taggedExportText(payload: BeeExportPayload) {
  const day = payload.targetDate ?? payload.recordedAt.slice(0, 10);
  return `${ORDINARY_CHECKIN_PREFIX} (${day}): ${payload.text}`.trim();
}

export function exportBodyForKind(
  kind: BeeExportKind,
  tagged: string,
): Record<string, unknown> {
  if (kind === "fact") {
    return { text: tagged, confirmed: true };
  }
  if (kind === "journal") {
    return { text: tagged };
  }
  return { text: tagged, summary: tagged, short_summary: tagged };
}

export function payloadHasScores(payload: BeeExportPayload) {
  const keys = Object.keys(payload);
  return (
    keys.some((key) => SCORE_KEYS.includes(key as (typeof SCORE_KEYS)[number])) ||
    JSON.stringify(payload).includes('"probes"')
  );
}

export function shouldPostExport(existing: BeeExportRecord | null) {
  return existing?.status !== "ok";
}

export function kindsToTry(preferred: BeeExportKind | null): BeeExportKind[] {
  if (preferred && EXPORT_ATTEMPTS.some((attempt) => attempt.kind === preferred)) {
    return [preferred];
  }
  return EXPORT_ATTEMPTS.map((attempt) => attempt.kind);
}

export function remoteIdFrom(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const row = body as Record<string, unknown>;
  const nested =
    nest(row.journal) ?? nest(row.conversation) ?? nest(row.fact) ?? row;
  const id =
    nested.id ??
    nested.journal_id ??
    nested.conversation_id ??
    nested.fact_id ??
    nested.journalId;
  return id === undefined || id === null ? null : String(id);
}

export async function runBeeExport(input: {
  payload: BeeExportPayload;
  existing: BeeExportRecord | null;
  preferredKind: BeeExportKind | null;
  now?: string;
  post: (kind: BeeExportKind, body: Record<string, unknown>) => Promise<BeeWriteResult>;
}): Promise<{ record: BeeExportRecord; posted: boolean; lockedKind: BeeExportKind | null }> {
  if (!shouldPostExport(input.existing)) {
    return { record: input.existing as BeeExportRecord, posted: false, lockedKind: input.preferredKind };
  }
  if (!input.payload.text) {
    return {
      record: {
        kind: null,
        remoteId: null,
        exportedAt: null,
        status: "skipped",
        error: null,
      },
      posted: false,
      lockedKind: input.preferredKind,
    };
  }

  const tagged = taggedExportText(input.payload);
  const kinds = kindsToTry(input.preferredKind);
  let lastError = "Bee declined the recording.";
  for (const kind of kinds) {
    const result = await input.post(kind, exportBodyForKind(kind, tagged));
    if (result.http === 0) {
      lastError = "Bee could not be reached.";
      break;
    }
    if (result.http === 401) {
      lastError = "The saved Bee token was not accepted.";
      break;
    }
    if (result.http >= 200 && result.http < 300) {
      return {
        record: {
          kind,
          remoteId: remoteIdFrom(result.body),
          exportedAt: input.now ?? new Date().toISOString(),
          status: "ok",
          error: null,
        },
        posted: true,
        lockedKind: kind,
      };
    }
    lastError = `Bee returned ${result.http}.`;
  }

  return {
    record: {
      kind: input.preferredKind,
      remoteId: null,
      exportedAt: input.now ?? new Date().toISOString(),
      status: "declined",
      error: lastError,
    },
    posted: true,
    lockedKind: input.preferredKind,
  };
}

export async function pushCheckinToBee(
  userId: string,
  checkinId: string,
  payload: BeeExportPayload,
) {
  const existing = await getBeeExport(checkinId);
  if (!shouldPostExport(existing)) {
    return existing;
  }
  await saveBeeExport(checkinId, {
    kind: existing?.kind ?? null,
    remoteId: existing?.remoteId ?? null,
    exportedAt: existing?.exportedAt ?? null,
    status: "pending",
    error: null,
  });
  const preferred = parseKind(await readSecret(userId, "bee", "export_kind"));
  const access = await resolveBeeAccess(userId);
  const result = await runBeeExport({
    payload,
    existing,
    preferredKind: preferred,
    post: (kind, body) =>
      beeRequest(access.origin, pathFor(kind), {
        token: access.token,
        method: "POST",
        body,
        timeoutMs: 12000,
      }),
  });
  if (result.lockedKind && result.record.status === "ok") {
    await writeSecret(userId, "bee", "export_kind", result.lockedKind);
  }
  await saveBeeExport(checkinId, result.record);
  return result.record;
}

export async function saveBeeExport(checkinId: string, record: BeeExportRecord) {
  await ready();
  await db()`
    update checkins
    set bee_export = ${db().json(record)}
    where id = ${checkinId}
  `;
}

export async function getBeeExport(checkinId: string): Promise<BeeExportRecord | null> {
  await ready();
  const rows = await db()`
    select bee_export
    from checkins
    where id = ${checkinId}
    limit 1
  `;
  return parseBeeExport(rows[0]?.bee_export);
}

export async function latestBeeExport(
  userId: string,
): Promise<{ record: BeeExportRecord; recordedAt: string } | null> {
  await ready();
  const rows = await db()`
    select bee_export, recorded_at
    from checkins
    where user_id = ${userId}
      and bee_export is not null
    order by recorded_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  const record = parseBeeExport(row.bee_export);
  if (!record) {
    return null;
  }
  return {
    record,
    recordedAt: new Date(row.recorded_at as string | Date).toISOString(),
  };
}

export function parseKind(value: string | null): BeeExportKind | null {
  if (value === "journal" || value === "conversation" || value === "fact") {
    return value;
  }
  return null;
}

export function parseBeeExport(value: unknown): BeeExportRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const status = row.status;
  if (
    status !== "ok" &&
    status !== "pending" &&
    status !== "declined" &&
    status !== "skipped"
  ) {
    return null;
  }
  return {
    kind: parseKind(typeof row.kind === "string" ? row.kind : null),
    remoteId: typeof row.remoteId === "string" ? row.remoteId : null,
    exportedAt: typeof row.exportedAt === "string" ? row.exportedAt : null,
    status,
    error: typeof row.error === "string" ? row.error : null,
  };
}

function pathFor(kind: BeeExportKind) {
  return EXPORT_ATTEMPTS.find((attempt) => attempt.kind === kind)?.path ?? "/v1/facts";
}

function nest(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
