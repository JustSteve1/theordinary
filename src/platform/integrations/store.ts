import type postgres from "postgres";

import { db, ready } from "@/src/platform/db";

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
): Promise<Connection | null> {
  await ready();
  const rows = (await db()`
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
) {
  await ready();
  await db()`
    delete from connections
    where user_id = ${userId}
      and provider = ${provider}
  `;
}

export type WhoopConnectionTx = {
  save: (connection: Connection) => Promise<void>;
  remove: () => Promise<void>;
  reread: () => Promise<Connection | null>;
};

export async function withWhoopConnectionLock<T>(
  userId: string,
  run: (current: Connection | null, tx: WhoopConnectionTx) => Promise<T>,
): Promise<T> {
  await ready();
  const result = await db().begin(async (tx) => {
    const read = async () => {
      const rows = (await tx`
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
          and provider = 'whoop'
        for update
      `) as ConnectionRow[];
      return rows[0] ? toConnection(rows[0]) : null;
    };
    const current = await read();
    return run(current, {
      save: (connection) => writeConnection(tx, connection),
      remove: async () => {
        await tx`
          delete from connections
          where user_id = ${userId}
            and provider = 'whoop'
        `;
      },
      reread: read,
    });
  });
  return result as T;
}

async function writeConnection(tx: postgres.TransactionSql, connection: Connection) {
  await tx`
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
