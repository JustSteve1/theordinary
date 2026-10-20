import { db, ready } from "@/src/platform/db";

export async function readSync(stream: string, scope = "global") {
  await ready();
  const rows = await db()`
    select cursor, last_success_at, last_error
    from warehouse_sync_state
    where stream = ${stream} and scope = ${scope}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    cursor: row.cursor ? new Date(row.cursor as string | Date).toISOString() : null,
    lastSuccessAt: row.last_success_at
      ? new Date(row.last_success_at as string | Date).toISOString()
      : null,
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

export async function writeSync(input: {
  stream: string;
  scope?: string;
  cursor?: string | null;
  error?: string | null;
  success?: boolean;
}) {
  await ready();
  const scope = input.scope ?? "global";
  await db()`
    insert into warehouse_sync_state (stream, scope, cursor, last_success_at, last_error, updated_at)
    values (
      ${input.stream},
      ${scope},
      ${input.cursor ?? null},
      ${input.success ? new Date().toISOString() : null},
      ${input.error ?? null},
      now()
    )
    on conflict (stream, scope) do update set
      cursor = coalesce(excluded.cursor, warehouse_sync_state.cursor),
      last_success_at = coalesce(excluded.last_success_at, warehouse_sync_state.last_success_at),
      last_error = excluded.last_error,
      updated_at = now()
  `;
}
