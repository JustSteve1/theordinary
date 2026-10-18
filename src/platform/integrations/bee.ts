import http from "node:http";
import https from "node:https";

import { beeRootCa } from "@/src/platform/integrations/bee-ca";
import { readSecret } from "@/src/platform/integrations/secrets";

export type BeeSnapshot = {
  status: "ok" | "down" | "unauthorized";
  timezone: string;
  name: string | null;
  conversations: { startMs: number; summary: string; detail: string }[];
  dailies: { atMs: number; summary: string }[];
  facts: string[];
  openTodos: string[];
  via: "account" | "machine" | "none";
};

const EMPTY: BeeSnapshot = {
  status: "down",
  timezone: "Europe/London",
  name: null,
  conversations: [],
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

export async function loadBee(userId?: string): Promise<BeeSnapshot> {
  if (userId) {
    const token = await readSecret(userId, "bee", "access_token");
    if (token) {
      return loadBeeFrom(BEE_API, token, "account");
    }
  }
  const origin = process.env.BEE_PROXY_URL ?? "http://127.0.0.1:8787";
  return loadBeeFrom(origin, undefined, "machine");
}

async function loadBeeFrom(
  origin: string,
  token: string | undefined,
  via: BeeSnapshot["via"],
): Promise<BeeSnapshot> {
  const [profile, conversations, dailies, todos, facts] = await Promise.all([
    beeGet(origin, "/v1/me", token),
    beeGet(origin, "/v1/conversations?limit=25", token),
    beeGet(origin, "/v1/daily?limit=14", token),
    beeGet(origin, "/v1/todos?limit=30", token),
    beeGet(origin, "/v1/facts?limit=20", token),
  ]);

  const responses = [profile, conversations, dailies, todos, facts];
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

  return {
    status: "ok",
    timezone,
    name: name || null,
    via,
    conversations: arrayField(record(conversations), "conversations").flatMap(
      (item) => {
        const startMs = toMs(item.start_time ?? item.created_at);
        if (startMs === null) {
          return [];
        }
        const summary =
          stringField(item, "short_summary") ??
          stringField(item, "title") ??
          "A conversation";
        return [
          {
            startMs,
            summary,
            detail: clip(stringField(item, "summary") ?? summary, 500),
          },
        ];
      },
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
  };
}

async function beeGet(
  origin: string,
  path: string,
  token?: string,
): Promise<Record<string, unknown> | "down" | "unauthorized"> {
  const target = new URL(path, origin);
  return new Promise((resolve) => {
    const client = target.protocol === "http:" ? http : https;
    const request = client.request(
      target,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        timeout: 8000,
        ...(target.hostname.endsWith("bee.amazon.dev") ? { ca: beeRootCa } : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          if (status === 401 || status === 403) {
            resolve("unauthorized");
            return;
          }
          if (status < 200 || status >= 300) {
            resolve({});
            return;
          }
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
            if (!body || typeof body !== "object" || Array.isArray(body)) {
              resolve({});
              return;
            }
            resolve(body as Record<string, unknown>);
          } catch {
            resolve({});
          }
        });
      },
    );
    request.on("timeout", () => {
      request.destroy();
      resolve("down");
    });
    request.on("error", (error) => {
      console.info(
        JSON.stringify({
          beeDown: true,
          host: target.host,
          code: "code" in error ? error.code : undefined,
          reason: error.message,
        }),
      );
      resolve("down");
    });
    request.end();
  });
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
