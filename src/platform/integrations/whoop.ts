import { randomBytes } from "crypto";

import { readSecrets } from "@/src/platform/integrations/secrets";
import {
  deleteConnection,
  getConnection,
  saveConnection,
  withWhoopConnectionLock,
  type Connection,
  type WhoopConnectionTx,
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

const refreshInflight = new Map<string, Promise<WhoopTokenResult>>();

export type WhoopTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "reconnect" | "temporary"; message: string };

const RECONNECT_MESSAGE = "WHOOP needs to be connected again.";
const TEMPORARY_REFRESH_MESSAGE =
  "WHOOP could not be refreshed. The connection is still saved.";

type TokenFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type WhoopRefreshDeps = {
  fetchImpl?: TokenFetch;
  now?: () => number;
  config?: WhoopConfig | null;
  lock?: <T>(
    userId: string,
    run: (current: Connection | null, tx: WhoopConnectionTx) => Promise<T>,
  ) => Promise<T>;
};

class WhoopTokenError extends Error {
  readonly kind: "invalid_grant" | "transient";

  constructor(message: string, kind: "invalid_grant" | "transient") {
    super(message);
    this.name = "WhoopTokenError";
    this.kind = kind;
  }
}

function whoopEnv() {
  return {
    clientId: process.env.WHOOP_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.WHOOP_CLIENT_SECRET?.trim() ?? "",
    redirectUri: process.env.WHOOP_REDIRECT_URI?.trim() ?? "",
  };
}

export function whoopConfig(): WhoopConfig | null {
  const env = whoopEnv();
  if (!env.clientId || !env.clientSecret || !env.redirectUri) {
    return null;
  }
  return env;
}

export async function whoopCredentials(userId: string) {
  const saved = await readSecrets(userId, "whoop");
  const env = whoopEnv();
  return {
    clientId: saved.get("client_id")?.trim() || env.clientId,
    clientSecret: saved.get("client_secret")?.trim() || env.clientSecret,
    redirectUri: saved.get("redirect_uri")?.trim() || env.redirectUri,
  };
}

export async function whoopAppConfig(
  userId: string,
): Promise<WhoopConfig | null> {
  const creds = await whoopCredentials(userId);
  if (!creds.clientId || !creds.clientSecret || !creds.redirectUri) {
    return null;
  }
  return creds;
}

export async function whoopAppStatus(userId: string) {
  const creds = await whoopCredentials(userId);
  return {
    ready: Boolean(creds.clientId && creds.clientSecret && creds.redirectUri),
    canAuthorize: Boolean(creds.clientId && creds.redirectUri),
    clientId: creds.clientId || null,
    redirectUri: creds.redirectUri || null,
  };
}

export function createWhoopState() {
  return randomBytes(4).toString("hex");
}

export function whoopAuthorizeUrl(
  config: { clientId: string; redirectUri: string },
  state: string,
) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", WHOOP_SCOPES);
  url.searchParams.set("state", state);
  return url;
}

export async function connectWhoop(input: { userId: string; code: string }) {
  const config = await whoopAppConfig(input.userId);
  if (!config) {
    throw new Error("WHOOP is not configured.");
  }

  const token = await requestToken(
    config,
    {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: config.redirectUri,
    },
    fetch,
  );
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
  const creds = await whoopCredentials(userId);
  if (!creds.clientId || !creds.redirectUri) {
    return blankWhoop(
      "unconfigured",
      "Add the WHOOP app credentials, then connect the account.",
    );
  }
  if (!creds.clientSecret) {
    return blankWhoop("disconnected", null);
  }

  const connection = await getConnection(userId, "whoop");
  if (!connection) {
    return blankWhoop("disconnected", null);
  }

  try {
    const accessToken = await accessTokenFor(connection);
    if (!accessToken.ok) {
      if (accessToken.reason === "reconnect") {
        return blankWhoop("disconnected", RECONNECT_MESSAGE);
      }
      return blankWhoop("error", accessToken.message);
    }

    const [recovery, sleep, cycles] = await Promise.all([
      whoopFetch<{ records?: unknown[] }>(
        accessToken.accessToken,
        "/v2/recovery?limit=10",
      ),
      whoopFetch<{ records?: unknown[] }>(
        accessToken.accessToken,
        "/v2/activity/sleep?limit=10",
      ),
      whoopFetch<{ records?: unknown[] }>(
        accessToken.accessToken,
        "/v2/cycle?limit=10",
      ),
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

export async function accessTokenFor(
  connection: Connection,
  deps: WhoopRefreshDeps = {},
): Promise<WhoopTokenResult> {
  const now = deps.now ?? Date.now;
  if (connection.expiresAt > now() + 60_000) {
    return { ok: true, accessToken: connection.accessToken };
  }

  const existing = refreshInflight.get(connection.userId);
  if (existing) {
    return existing;
  }

  const pending = refreshWhoopConnection(connection, deps).finally(() => {
    refreshInflight.delete(connection.userId);
  });
  refreshInflight.set(connection.userId, pending);
  return pending;
}

export async function refreshWhoopConnection(
  connection: Connection,
  deps: WhoopRefreshDeps = {},
): Promise<WhoopTokenResult> {
  const config =
    deps.config === undefined
      ? await whoopAppConfig(connection.userId)
      : deps.config;
  if (!config) {
    return { ok: false, reason: "temporary", message: "WHOOP is not configured." };
  }

  const now = deps.now ?? Date.now;
  const lock = deps.lock ?? withWhoopConnectionLock;
  try {
    return await lock(connection.userId, (current, tx) =>
      refreshLocked(current, tx, config, deps.fetchImpl ?? fetch, now),
    );
  } catch (error) {
    return {
      ok: false,
      reason: "temporary",
      message: error instanceof Error ? error.message : TEMPORARY_REFRESH_MESSAGE,
    };
  }
}

async function refreshLocked(
  current: Connection | null,
  tx: WhoopConnectionTx,
  config: WhoopConfig,
  fetchImpl: TokenFetch,
  now: () => number,
): Promise<WhoopTokenResult> {
  if (!current) {
    return { ok: false, reason: "reconnect", message: RECONNECT_MESSAGE };
  }
  if (current.expiresAt > now() + 60_000) {
    return { ok: true, accessToken: current.accessToken };
  }

  const sentRefreshToken = current.refreshToken;
  try {
    const token = await requestToken(
      config,
      {
        grant_type: "refresh_token",
        refresh_token: sentRefreshToken,
        scope: "offline",
      },
      fetchImpl,
    );
    const next: Connection = {
      ...current,
      scopes: token.scope || current.scopes,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: now() + token.expires_in * 1000,
    };
    await tx.save(next);
    return { ok: true, accessToken: next.accessToken };
  } catch (error) {
    if (error instanceof WhoopTokenError && error.kind === "invalid_grant") {
      const latest = await tx.reread();
      if (latest && latest.refreshToken !== sentRefreshToken) {
        if (latest.expiresAt > now() + 60_000) {
          return { ok: true, accessToken: latest.accessToken };
        }
        return {
          ok: false,
          reason: "temporary",
          message: TEMPORARY_REFRESH_MESSAGE,
        };
      }
      await tx.remove();
      return { ok: false, reason: "reconnect", message: RECONNECT_MESSAGE };
    }
    return {
      ok: false,
      reason: "temporary",
      message: error instanceof Error ? error.message : TEMPORARY_REFRESH_MESSAGE,
    };
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
  fetchImpl: TokenFetch,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...fields,
  });
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
  } catch (error) {
    throw new WhoopTokenError(
      error instanceof Error ? error.message : "WHOOP token request failed.",
      "transient",
    );
  }
  if (!response.ok) {
    const errorCode = await tokenErrorCode(response);
    if (errorCode === "invalid_grant") {
      throw new WhoopTokenError(
        `WHOOP token request failed (${response.status}, invalid_grant).`,
        "invalid_grant",
      );
    }
    throw new WhoopTokenError(
      `WHOOP token request failed (${response.status}).`,
      "transient",
    );
  }
  let token: Partial<TokenResponse>;
  try {
    token = (await response.json()) as Partial<TokenResponse>;
  } catch {
    throw new WhoopTokenError("WHOOP returned an incomplete token.", "transient");
  }
  if (
    typeof token.access_token !== "string" ||
    typeof token.refresh_token !== "string" ||
    typeof token.expires_in !== "number"
  ) {
    throw new WhoopTokenError("WHOOP returned an incomplete token.", "transient");
  }
  return token as TokenResponse;
}

async function tokenErrorCode(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : "";
  } catch {
    return "";
  }
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
