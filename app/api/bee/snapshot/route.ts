import { beeBriefText } from "@/lib/chat/brief";
import { findMemberIdByEmail, saveBeeBrief } from "@/lib/chat/store";
import type { BeeSnapshot } from "@/lib/integrations/bee/client";
import { bearerAuthorized } from "@/lib/integrations/bearer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.BEE_SYNC_SECRET?.trim();
  if (
    !secret ||
    !bearerAuthorized(request.headers.get("authorization"), secret)
  ) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON brief." }, { status: 400 });
  }

  const brief = parseBrief(body);
  if (!brief) {
    return Response.json(
      { error: "The brief was incomplete." },
      { status: 400 },
    );
  }

  const userId = await findMemberIdByEmail(brief.email);
  if (!userId) {
    return Response.json(
      { error: "No member with that email." },
      { status: 404 },
    );
  }

  await saveBeeBrief(userId, beeBriefText(brief.bee));
  return Response.json({ ok: true });
}

function parseBrief(
  value: unknown,
): { email: string; bee: BeeSnapshot } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const email = stringValue(record.email);
  const timezone = stringValue(record.timezone) ?? "Europe/London";
  if (!email) {
    return null;
  }
  const conversations = objectArray(record.conversations)
    .flatMap((item) => {
      const startMs = numberValue(item.startMs);
      const summary = stringValue(item.summary);
      return startMs === null || !summary ? [] : [{ startMs, summary }];
    })
    .slice(0, 8);
  const dailies = objectArray(record.dailies)
    .flatMap((item) => {
      const atMs = numberValue(item.atMs);
      return atMs === null ? [] : [{ atMs }];
    })
    .slice(0, 4);
  const openTodos = stringArray(record.openTodos).slice(0, 10);
  return {
    email,
    bee: {
      status: "ok",
      timezone,
      conversations,
      dailies,
      openTodos,
    },
  };
}

function objectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const text = stringValue(item);
    return text ? [text] : [];
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
