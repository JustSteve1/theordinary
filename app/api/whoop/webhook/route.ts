import {
  clientSecretFor,
  loadRowsForWebhook,
  memberForWhoopUser,
  parseWhoopWebhook,
  signatureMatches,
} from "@/src/platform/integrations/whoop-sync";
import { accessTokenFor } from "@/src/platform/integrations/whoop";
import { getConnection } from "@/src/platform/integrations/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const raw = await request.text();
  const timestamp = request.headers.get("x-whoop-signature-timestamp") ?? "";
  const signature = request.headers.get("x-whoop-signature") ?? "";
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const event = parseWhoopWebhook(body);
  if (!event || !timestamp || !signature) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = await memberForWhoopUser(event.userId);
  const secret = userId ? await clientSecretFor(userId) : process.env.WHOOP_CLIENT_SECRET || "";
  if (!secret || !signatureMatches(secret, timestamp, raw, signature)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!userId) {
    return Response.json({ ignored: true });
  }
  const connection = await getConnection(userId, "whoop");
  const token = connection ? await accessTokenFor(connection) : null;
  if (!token?.ok) {
    return Response.json({ ignored: true });
  }
  await loadRowsForWebhook(userId, event, token.accessToken);
  return Response.json({ ok: true });
}
