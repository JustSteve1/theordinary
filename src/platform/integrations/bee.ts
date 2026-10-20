import http from "node:http";
import https from "node:https";

import { beeRootCa } from "@/src/platform/integrations/bee-ca";
import { withoutOrdinaryEchoes } from "@/src/platform/integrations/bee-echo";
import { readSecret } from "@/src/platform/integrations/secrets";

export type BeeNote = { startMs: number; summary: string; detail: string };

export type BeeSnapshot = {
  status: "ok" | "down" | "unauthorized";
  timezone: string;
  name: string | null;
  conversations: BeeNote[];
  journals: BeeNote[];
  dailies: { atMs: number; summary: string }[];
  facts: string[];
  openTodos: string[];
  via: "account" | "machine" | "none";
};

export type BeeAccess = {
  origin: string;
  token?: string;
  via: BeeSnapshot["via"];
};

export type BeeRequestResult = {
  http: number;
  body: unknown;
};

const EMPTY: BeeSnapshot = {
  status: "down",
  timezone: "Europe/London",
  name: null,
  conversations: [],
  journals: [],
  dailies: [],
  facts: [],
  openTodos: [],
  via: "none",
};

const BEE_API = "https://app-api-developer.ce.bee.amazon.dev";

export async function verifyBeeToken(token: string) {
  const profile = await beeGet(BEE_API, "/v1/me", token);
  if (profile === "down" || profile === "unauthorized") {
    return null;
  }
  const name = [
    stringField(profile, "first_name"),
    stringField(profile, "last_name"),
  ]
    .filter(Boolean)
    .join(" ");
  return name ? { name } : { name: "Bee" };
}

export async function resolveBeeAccess(userId?: string): Promise<BeeAccess> {
  if (userId) {
    const token = await readSecret(userId, "bee", "access_token");
    if (token) {
      return { origin: BEE_API, token, via: "account" };
    }
  }
  return {
    origin: process.env.BEE_PROXY_URL ?? "http://127.0.0.1:8787",
    via: "machine",
  };
}

export async function loadBee(userId?: string): Promise<BeeSnapshot> {
  const access = await resolveBeeAccess(userId);
  return loadBeeFrom(access.origin, access.token, access.via);
}

async function loadBeeFrom(
  origin: string,
  token: string | undefined,
  via: BeeSnapshot["via"],
): Promise<BeeSnapshot> {
  const [profile, conversations, journals, dailies, todos, facts] =
    await Promise.all([
      beeGet(origin, "/v1/me", token),
      beeGet(origin, "/v1/conversations?limit=25", token),
      beeGet(origin, "/v1/journals?limit=25", token),
      beeGet(origin, "/v1/daily?limit=14", token),
      beeGet(origin, "/v1/todos?limit=30", token),
      beeGet(origin, "/v1/facts?limit=20", token),
    ]);

  const responses = [profile, conversations, journals, dailies, todos, facts];
  if (responses.every((response) => response === "down")) {
    return EMPTY;
  }
  if (profile === "unauthorized") {
    return { ...EMPTY, status: "unauthorized", via };
  }

  const timezone =
    stringField(record(profile), "timezone") ??
    stringField(record(conversations), "timezone") ??
    "Europe/London";

  const profileRecord = record(profile);
  const name = [
    stringField(profileRecord, "first_name"),
    stringField(profileRecord, "last_name"),
  ]
    .filter(Boolean)
    .join(" ");

  return withoutOrdinaryEchoes({
    status: "ok",
    timezone,
    name: name || null,
    via,
    conversations: notesFrom(
      record(conversations),
      ["conversations"],
      "A conversation",
    ),
    journals: notesFrom(
      record(journals),
      ["journals", "notes", "voice_notes"],
      "A journal",
    ),
    dailies: arrayField(
      record(dailies),
      "daily_summaries",
      "dailies",
      "daily",
    ).flatMap((item) => {
      const atMs = toMs(
        item.date_time ?? item.date ?? item.created_at ?? item.updated_at,
      );
      if (atMs === null) {
        return [];
      }
      return [
        {
          atMs,
          summary: clip(
            stringField(item, "short_summary") ??
              stringField(item, "summary") ??
              "",
            700,
          ),
        },
      ];
    }),
    facts: arrayField(record(facts), "facts")
      .flatMap((item) => {
        const text = stringField(item, "text");
        return text ? [{ text, confirmed: item.confirmed === true }] : [];
      })
      .sort((a, b) => Number(b.confirmed) - Number(a.confirmed))
      .slice(0, 12)
      .map((fact) => fact.text),
    openTodos: arrayField(record(todos), "todos").flatMap((item) => {
      if (item.completed === true) {
        return [];
      }
      const text = stringField(item, "text");
      return text ? [text] : [];
    }),
  });
}

export async function beeRequest(
  origin: string,
  path: string,
  options: {
    token?: string;
    method?: string;
    body?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<BeeRequestResult> {
  const target = new URL(path, origin);
  const method = options.method ?? "GET";
  const payload =
    options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise((resolve) => {
    const client = target.protocol === "http:" ? http : https;
    const request = client.request(
      target,
      {
        method,
        headers: {
          accept: "application/json",
          ...(payload ? { "content-type": "application/json" } : {}),
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
        timeout: options.timeoutMs ?? 8000,
        ...(target.hostname.endsWith("bee.amazon.dev") ? { ca: beeRootCa } : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const httpStatus = response.statusCode ?? 0;
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({ http: httpStatus, body: parseBody(raw) });
        });
      },
    );
    request.on("timeout", () => {
      request.destroy();
      resolve({ http: 0, body: null });
    });
    request.on("error", (error) => {
      console.info(
        JSON.stringify({
          beeDown: true,
          host: target.host,
          method,
          code: "code" in error ? error.code : undefined,
          reason: error.message,
        }),
      );
      resolve({ http: 0, body: null });
    });
    request.end(payload);
  });
}

async function beeGet(
  origin: string,
  path: string,
  token?: string,
): Promise<Record<string, unknown> | "down" | "unauthorized"> {
  const result = await beeRequest(origin, path, { token });
  if (result.http === 0) {
    return "down";
  }
  if (result.http === 401 || result.http === 403) {
    return "unauthorized";
  }
  if (result.http < 200 || result.http >= 300) {
    return {};
  }
  if (Array.isArray(result.body)) {
    return { items: result.body };
  }
  if (result.body && typeof result.body === "object") {
    return result.body as Record<string, unknown>;
  }
  return {};
}

function notesFrom(
  payload: Record<string, unknown>,
  keys: string[],
  fallback: string,
): BeeNote[] {
  const rows = arrayField(payload, ...keys, "items");
  return rows.flatMap((item) => {
    const startMs = toMs(
      item.start_time ??
        item.created_at ??
        item.createdAt ??
        item.updated_at ??
        item.date,
    );
    if (startMs === null) {
      return [];
    }
    const summary =
      stringField(item, "short_summary") ??
      stringField(item, "title") ??
      stringField(item, "text") ??
      fallback;
    const detail =
      stringField(item, "summary") ??
      stringField(item, "text") ??
      stringField(item, "cleanedUpText") ??
      summary;
    return [
      {
        startMs,
        summary: clip(summary, 240),
        detail: clip(detail, 500),
      },
    ];
  });
}

function parseBody(raw: string): unknown {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function record(
  value: Record<string, unknown> | "down" | "unauthorized",
): Record<string, unknown> {
  return value === "down" || value === "unauthorized" ? {} : value;
}

function arrayField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
    }
  }
  return [];
}

function clip(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) {
    return clean;
  }
  return `${clean.slice(0, max - 1)}…`;
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function toMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
