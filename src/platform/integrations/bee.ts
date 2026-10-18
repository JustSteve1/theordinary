export type BeeSnapshot = {
  status: "ok" | "down" | "unauthorized";
  timezone: string;
  conversations: { startMs: number; summary: string }[];
  dailies: { atMs: number; summary: string }[];
  openTodos: string[];
};

const EMPTY: BeeSnapshot = {
  status: "down",
  timezone: "Europe/London",
  conversations: [],
  dailies: [],
  openTodos: [],
};

export async function loadBee(): Promise<BeeSnapshot> {
  const origin = process.env.BEE_PROXY_URL ?? "http://127.0.0.1:8787";
  const [profile, conversations, dailies, todos] = await Promise.all([
    beeGet(origin, "/v1/me"),
    beeGet(origin, "/v1/conversations?limit=25"),
    beeGet(origin, "/v1/daily?limit=14"),
    beeGet(origin, "/v1/todos?limit=30"),
  ]);

  const responses = [profile, conversations, dailies, todos];
  if (responses.every((response) => response === "down")) {
    return EMPTY;
  }
  if (profile === "unauthorized") {
    return { ...EMPTY, status: "unauthorized" };
  }

  const timezone =
    stringField(record(profile), "timezone") ??
    stringField(record(conversations), "timezone") ??
    "Europe/London";

  return {
    status: "ok",
    timezone,
    conversations: arrayField(record(conversations), "conversations").flatMap(
      (item) => {
        const startMs = toMs(item.start_time ?? item.created_at);
        if (startMs === null) {
          return [];
        }
        return [
          {
            startMs,
            summary:
              stringField(item, "short_summary") ??
              stringField(item, "title") ??
              "A conversation",
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
      const summary =
        stringField(item, "short_summary") ?? stringField(item, "summary") ?? "";
      return atMs === null ? [] : [{ atMs, summary: summary.slice(0, 500) }];
    }),
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
): Promise<Record<string, unknown> | "down" | "unauthorized"> {
  try {
    const response = await fetch(`${origin}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 401 || response.status === 403) {
      return "unauthorized";
    }
    if (!response.ok) {
      return {};
    }
    const body = (await response.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return {};
    }
    return body as Record<string, unknown>;
  } catch {
    return "down";
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
