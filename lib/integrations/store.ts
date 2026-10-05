import type { Sql } from "postgres";

import { db, ready } from "@/lib/db";

export type Connection = {
  userId: string;
  provider: "whoop";
  providerUserId: string;
  scopes: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type ConnectionRow = {
  user_id: string;
  provider: Connection["provider"];
  provider_user_id: string;
  scopes: string;
  access_token: string;
  refresh_token: string;
  expires_at: string | number;
};

export async function getConnection(
  userId: string,
  provider: Connection["provider"],
  sql?: Sql,
): Promise<Connection | null> {
  const query = await connectionSql(sql);
  const rows = (await query`
    select
      user_id,
      provider,
      provider_user_id,
      scopes,
      access_token,
      refresh_token,
      expires_at
    from connections
    where user_id = ${userId}
      and provider = ${provider}
    limit 1
  `) as ConnectionRow[];
  const row = rows[0];
  return row ? toConnection(row) : null;
}

export async function saveConnection(connection: Connection) {
  await ready();
  await db()`
    insert into connections (
      user_id,
      provider,
      provider_user_id,
      scopes,
      access_token,
      refresh_token,
      expires_at
    )
    values (
      ${connection.userId},
      ${connection.provider},
      ${connection.providerUserId},
      ${connection.scopes},
      ${connection.accessToken},
      ${connection.refreshToken},
      ${connection.expiresAt}
    )
    on conflict (user_id, provider) do update set
      provider_user_id = excluded.provider_user_id,
      scopes = excluded.scopes,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at
  `;
}

export async function deleteConnection(
  userId: string,
  provider: Connection["provider"],
  sql?: Sql,
) {
  const query = await connectionSql(sql);
  await query`
    delete from connections
    where user_id = ${userId}
      and provider = ${provider}
  `;
}

export async function replaceWhoopRefresh(
  connection: Connection,
  previousRefreshToken: string,
  sql?: Sql,
): Promise<Connection | null> {
  const query = await connectionSql(sql);
  const rows = (await query`
    update connections
    set
      provider_user_id = ${connection.providerUserId},
      scopes = ${connection.scopes},
      access_token = ${connection.accessToken},
      refresh_token = ${connection.refreshToken},
      expires_at = ${connection.expiresAt}
    where user_id = ${connection.userId}
      and provider = ${connection.provider}
      and refresh_token = ${previousRefreshToken}
    returning
      user_id,
      provider,
      provider_user_id,
      scopes,
      access_token,
      refresh_token,
      expires_at
  `) as ConnectionRow[];
  const row = rows[0];
  return row ? toConnection(row) : null;
}

export async function withWhoopLock<T>(
  userId: string,
  run: (sql: Sql) => Promise<T>,
): Promise<T> {
  await ready();
  const reserved = await db().reserve();
  const key = advisoryKey(userId);
  try {
    await reserved`select pg_advisory_lock(${key}::bigint)`;
    try {
      return await run(reserved);
    } finally {
      await reserved`select pg_advisory_unlock(${key}::bigint)`;
    }
  } finally {
    reserved.release();
  }
}

async function connectionSql(sql?: Sql) {
  if (sql) {
    return sql;
  }
  await ready();
  return db();
}

function advisoryKey(userId: string) {
  let hash = 2166136261;
  const value = `whoop:${userId}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function toConnection(row: ConnectionRow): Connection {
  return {
    userId: row.user_id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    scopes: row.scopes,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: Number(row.expires_at),
  };
}
