import { randomUUID } from "crypto";

import { db, ready } from "@/lib/db";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
};

export async function listMessages(userId: string): Promise<ChatMessage[]> {
  await ready();
  const rows = (await db()`
    select id, role, body
    from chat_messages
    where user_id = ${userId}
    order by created_at desc
    limit 20
  `) as { id: string; role: string; body: string }[];
  return rows.reverse().flatMap((row) => {
    if (row.role !== "user" && row.role !== "assistant") {
      return [];
    }
    return [{ id: row.id, role: row.role, body: row.body }];
  });
}

export async function saveExchange(
  userId: string,
  userBody: string,
  assistantBody: string,
) {
  await ready();
  await db().begin(async (sql) => {
    await sql`
      insert into chat_messages (id, user_id, role, body)
      values (${randomUUID()}, ${userId}, ${"user"}, ${userBody})
    `;
    await sql`
      insert into chat_messages (id, user_id, role, body)
      values (${randomUUID()}, ${userId}, ${"assistant"}, ${assistantBody})
    `;
  });
}

export async function loadBeeBrief(userId: string) {
  await ready();
  const rows = (await db()`
    select body
    from bee_briefs
    where user_id = ${userId}
    limit 1
  `) as { body: string }[];
  return rows[0]?.body ?? null;
}

export async function saveBeeBrief(userId: string, body: string) {
  await ready();
  await db()`
    insert into bee_briefs (user_id, body)
    values (${userId}, ${body})
    on conflict (user_id) do update set
      body = excluded.body,
      updated_at = now()
  `;
}

export async function findMemberIdByEmail(email: string) {
  await ready();
  const rows = (await db()`
    select id
    from members
    where email = ${email.trim().toLowerCase()}
    limit 1
  `) as { id: string }[];
  return rows[0]?.id ?? null;
}
