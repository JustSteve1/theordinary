import { findMemberIdByEmail } from "@/lib/chat/store";
import { bearerAuthorized } from "@/lib/integrations/bearer";
import { awaitingCapture, pendingFacts } from "@/lib/skills/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await memberFromRequest(request);
  if (gate instanceof Response) {
    return gate;
  }
  const [capture, facts] = await Promise.all([
    awaitingCapture(gate),
    pendingFacts(gate),
  ]);
  return Response.json({ awaiting_capture: capture, facts });
}

async function memberFromRequest(request: Request) {
  const secret = process.env.BEE_SYNC_SECRET?.trim();
  if (
    !secret ||
    !bearerAuthorized(request.headers.get("authorization"), secret)
  ) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const email = new URL(request.url).searchParams.get("email")?.trim() ?? "";
  if (!email) {
    return Response.json({ error: "Say which member." }, { status: 400 });
  }
  const userId = await findMemberIdByEmail(email);
  if (!userId) {
    return Response.json(
      { error: "No member with that email." },
      { status: 404 },
    );
  }
  return userId;
}
