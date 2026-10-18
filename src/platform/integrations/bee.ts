export type BeeSnapshot = {
  status: "ok" | "down" | "unauthorized";
  timezone: string;
  name: string | null;
  conversations: { startMs: number; summary: string; detail: string }[];
  dailies: { atMs: number; summary: string }[];
  facts: string[];
  openTodos: string[];
};

const EMPTY: BeeSnapshot = {
  status: "down",
  timezone: "Europe/London",
  name: null,
  conversations: [],
  dailies: [],
  facts: [],
  openTodos: [],
};

export async function loadBee(): Promise<BeeSnapshot> {
  const origin = process.env.BEE_PROXY_URL ?? "http://127.0.0.1:8787";
  const [profile, conversations, dailies, todos, facts] = await Promise.all([
    beeGet(origin, "/v1/me"),
    beeGet(origin, "/v1/conversations?limit=8"),
    beeGet(origin, "/v1/daily?limit=2"),
    beeGet(origin, "/v1/todos?limit=30"),
    beeGet(origin, "/v1/facts?limit=20"),
  ]);

  const responses = [profile, conversations, dailies, todos, facts];
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
