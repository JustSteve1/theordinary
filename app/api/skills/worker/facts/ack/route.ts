import { findMemberIdByEmail } from "@/lib/chat/store";
import { bearerAuthorized } from "@/lib/integrations/bearer";
import { ackFacts } from "@/lib/skills/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.BEE_SYNC_SECRET?.trim();
  if (
    !secret ||
    !bearerAuthorized(request.headers.get("authorization"), secret)
  ) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const body = await readJson(request);
  if (!body) {
    return Response.json({ error: "Send a JSON body." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  const ids = Array.isArray(body.ids)
    ? body.ids.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  if (!email || ids.length === 0) {
    return Response.json(
      { error: "The acknowledgement was incomplete." },
      { status: 400 },
    );
  }
  const userId = await findMemberIdByEmail(email);
  if (!userId) {
    return Response.json(
      { error: "No member with that email." },
      { status: 404 },
    );
  }
  return Response.json({ acked: await ackFacts(userId, ids) });
}

async function readJson(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
