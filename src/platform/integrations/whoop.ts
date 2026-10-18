import { randomBytes } from "crypto";

import {
  deleteConnection,
  getConnection,
  saveConnection,
  type Connection,
} from "@/src/platform/integrations/store";

const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const AUTHORIZE_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const API_BASE = "https://api.prod.whoop.com/developer";
export const WHOOP_SCOPES =
  "offline read:profile read:recovery read:cycles read:sleep read:workout";

export type WhoopConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type WhoopSnapshot = {
  status: "unconfigured" | "disconnected" | "error" | "ok";
  message: string | null;
  recovery: WhoopScore | null;
  sleep: WhoopScore | null;
  strain: WhoopScore | null;
  recent: WhoopReading[];
};

export type WhoopScore = {
  state: string;
  atMs: number | null;
  value: number | null;
  detail: string;
};

export type WhoopReading = WhoopScore & {
  kind: "Recovery" | "Sleep" | "Strain";
};

const refreshInflight = new Map<string, Promise<Connection | null>>();

export function whoopConfig(): WhoopConfig | null {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

export function createWhoopState() {
  return randomBytes(4).toString("hex");
}

export function whoopAuthorizeUrl(config: WhoopConfig, state: string) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", WHOOP_SCOPES);
  url.searchParams.set("state", state);
  return url;
}

export async function connectWhoop(input: { userId: string; code: string }) {
  const config = whoopConfig();
  if (!config) {
    throw new Error("WHOOP is not configured.");
  }

  const token = await requestToken(config, {
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: config.redirectUri,
  });
  const profile = await whoopFetch<Record<string, unknown>>(
    token.access_token,
    "/v2/user/profile/basic",
  );
  const providerUserId = String(profile.user_id ?? "");
  if (!providerUserId) {
    throw new Error("WHOOP did not return a profile.");
  }

  await saveConnection({
    userId: input.userId,
    provider: "whoop",
    providerUserId,
    scopes: token.scope || WHOOP_SCOPES,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  });
}

export async function disconnectWhoop(userId: string) {
  const connection = await getConnection(userId, "whoop");
  if (connection) {
    await fetch(`${API_BASE}/v2/user/access`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${connection.accessToken}` },
    }).catch(() => undefined);
  }
  await deleteConnection(userId, "whoop");
}

function blankWhoop(
  status: WhoopSnapshot["status"],
  message: string | null,
): WhoopSnapshot {
  return {
    status,
    message,
    recovery: null,
    sleep: null,
    strain: null,
    recent: [],
  };
}

export async function loadWhoop(userId: string): Promise<WhoopSnapshot> {
  if (!whoopConfig()) {
    return blankWhoop("unconfigured", "WHOOP is not configured on this server.");
  }

  const connection = await getConnection(userId, "whoop");
  if (!connection) {
    return blankWhoop("disconnected", null);
  }

  try {
    const accessToken = await accessTokenFor(connection);
    if (!accessToken) {
      return blankWhoop("disconnected", "WHOOP needs to be connected again.");
    }

    const [recovery, sleep, cycles] = await Promise.all([
      whoopFetch<{ records?: unknown[] }>(accessToken, "/v2/recovery?limit=10"),
      whoopFetch<{ records?: unknown[] }>(
        accessToken,
        "/v2/activity/sleep?limit=10",
      ),
      whoopFetch<{ records?: unknown[] }>(accessToken, "/v2/cycle?limit=10"),
    ]);

    const recent = [
      ...mapMany(recovery.records, mapRecovery, "Recovery"),
      ...mapMany(sleep.records, mapSleep, "Sleep"),
      ...mapMany(cycles.records, mapStrain, "Strain"),
    ];

    return {
      status: "ok",
      message: null,
      recovery: recent.find((reading) => reading.kind === "Recovery") ?? null,
      sleep: recent.find((reading) => reading.kind === "Sleep") ?? null,
      strain: recent.find((reading) => reading.kind === "Strain") ?? null,
      recent,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("429")
        ? "WHOOP is busy. Try again shortly."
        : "WHOOP could not be read.";
    return blankWhoop("error", message);
  }
}

async function accessTokenFor(connection: Connection) {
  if (connection.expiresAt > Date.now() + 60_000) {
    return connection.accessToken;
  }

  const existing = refreshInflight.get(connection.userId);
  if (existing) {
    const refreshed = await existing;
    return refreshed?.accessToken ?? null;
  }

  const pending = refreshConnection(connection).finally(() => {
    refreshInflight.delete(connection.userId);
  });
  refreshInflight.set(connection.userId, pending);
  const refreshed = await pending;
  return refreshed?.accessToken ?? null;
}

async function refreshConnection(
  connection: Connection,
): Promise<Connection | null> {
  const config = whoopConfig();
  if (!config) {
    return null;
  }

  try {
    const token = await requestToken(config, {
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
      scope: "offline",
    });
    const next: Connection = {
      ...connection,
      scopes: token.scope || connection.scopes,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    await saveConnection(next);
    return next;
  } catch {
    await deleteConnection(connection.userId, "whoop");
    return null;
  }
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
};

async function requestToken(
  config: WhoopConfig,
  fields: Record<string, string>,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...fields,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`WHOOP token request failed (${response.status}).`);
  }
  const token = (await response.json()) as Partial<TokenResponse>;
  if (
    typeof token.access_token !== "string" ||
    typeof token.refresh_token !== "string" ||
    typeof token.expires_in !== "number"
  ) {
    throw new Error("WHOOP returned an incomplete token.");
  }
  return token as TokenResponse;
}

async function whoopFetch<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.status === 429) {
    throw new Error("WHOOP 429");
  }
  if (!response.ok) {
    throw new Error(`WHOOP request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function mapMany(
  records: unknown[] | undefined,
  map: (value: unknown) => WhoopScore | null,
  kind: WhoopReading["kind"],
): WhoopReading[] {
  return (records ?? []).slice(0, 7).flatMap((record) => {
    const score = map(record);
    return score ? [{ ...score, kind }] : [];
  });
}

function mapRecovery(value: unknown): WhoopScore | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const score = asRecord(record.score);
  const recovery =
    typeof score?.recovery_score === "number" ? score.recovery_score : null;
  const hrv =
    typeof score?.hrv_rmssd_milli === "number" ? score.hrv_rmssd_milli : null;
  const rhr =
    typeof score?.resting_heart_rate === "number"
      ? score.resting_heart_rate
      : null;
  const parts = [
    recovery !== null ? `Recovery ${Math.round(recovery)}` : null,
    hrv !== null ? `HRV ${Math.round(hrv)} ms` : null,
    rhr !== null ? `resting heart rate ${Math.round(rhr)}` : null,
  ].filter(Boolean);
  return {
    state: typeof record.score_state === "string" ? record.score_state : "",
    atMs: toMs(record.created_at),
    value: recovery,
    detail: parts.join(", ") || "Recovery",
  };
}

function mapSleep(value: unknown): WhoopScore | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const score = asRecord(record.score);
  const performance =
    typeof score?.sleep_performance_percentage === "number"
      ? score.sleep_performance_percentage
      : null;
  return {
    state: typeof record.score_state === "string" ? record.score_state : "",
    atMs: toMs(record.start ?? record.created_at),
    value: performance,
    detail:
      performance !== null
        ? `Sleep performance ${Math.round(performance)}%`
        : "Sleep",
  };
}

function mapStrain(value: unknown): WhoopScore | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const score = asRecord(record.score);
  const strain = typeof score?.strain === "number" ? score.strain : null;
  return {
    state: typeof record.score_state === "string" ? record.score_state : "",
    atMs: toMs(record.start ?? record.created_at),
    value: strain,
    detail: strain !== null ? `Strain ${strain.toFixed(1)}` : "Strain",
  };
}

function toMs(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
