import { db, ready } from "@/src/platform/db";

export async function readSecret(
  userId: string,
  provider: string,
  name: string,
): Promise<string | null> {
  const secrets = await readSecrets(userId, provider);
  return secrets.get(name) ?? null;
}

export async function readSecrets(userId: string, provider: string) {
  await ready();
  const rows = (await db()`
    select name, value
    from integration_secrets
    where user_id = ${userId}
      and provider = ${provider}
  `) as { name: string; value: string }[];
  return new Map(rows.map((row) => [row.name, row.value]));
}

export async function writeSecret(
  userId: string,
  provider: string,
  name: string,
  value: string,
) {
  await ready();
  await db()`
    insert into integration_secrets (user_id, provider, name, value)
    values (${userId}, ${provider}, ${name}, ${value})
    on conflict (user_id, provider, name) do update set
      value = excluded.value
  `;
}

export async function deleteSecrets(userId: string, provider: string) {
  await ready();
  await db()`
    delete from integration_secrets
    where user_id = ${userId}
      and provider = ${provider}
  `;
}
