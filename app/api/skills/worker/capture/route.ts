import { findMemberIdByEmail } from "@/lib/chat/store";
import { bearerAuthorized } from "@/lib/integrations/bearer";
import {
  asGroundTruth,
  extractDocument,
  groundTruthPrompt,
} from "@/lib/skills/episodic-recall/extract";
import { recallPrompt } from "@/lib/skills/episodic-recall/prompts";
import {
  selectWindow,
  type ConversationInput,
} from "@/lib/skills/episodic-recall/window";
import {
  closeSession,
  loadSkillSession,
  saveGroundTruth,
  type StoredWindow,
} from "@/lib/skills/store";

export const dynamic = "force-dynamic";

const MAX_CONVERSATIONS = 40;
const MAX_UTTERANCE_CHARS = 60000;

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
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!email || !sessionId) {
    return Response.json(
      { error: "The capture was incomplete." },
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
  const session = await loadSkillSession(sessionId);
  if (!session || session.userId !== userId) {
    return Response.json(
      { error: "That check-in does not exist." },
      { status: 404 },
    );
  }
  if (session.phase !== "awaiting_capture" || !session.targetDate) {
    return Response.json(
      { error: "That check-in is not waiting for Bee." },
      { status: 409 },
    );
  }
  const conversations = parseConversations(body.conversations);
  if (!conversations) {
    return Response.json(
      { error: "The conversations were too large or incomplete." },
      { status: 400 },
    );
  }
  const selected = selectWindow(conversations, {
    date: session.targetDate,
    timeZone: session.timezone,
  });
  if (!selected.eligible) {
    await closeSession(session.id, "ineligible");
    return Response.json({
      ok: true,
      eligible: false,
      phase: "ineligible",
      reason: selected.reason,
    });
  }
  const summary =
    typeof body.dailySummary === "string"
      ? body.dailySummary.slice(0, 12000)
      : "";
  const transcripts = transcriptText(conversations, selected.conversation_ids);
  let extracted: ReturnType<typeof asGroundTruth>;
  try {
    extracted = asGroundTruth(
      await extractDocument(
        groundTruthPrompt({
          date: selected.date,
          window: selected.window,
          summary,
          transcripts,
        }),
      ),
      selected.date,
      selected.window,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Chat is not configured on this server.") {
      return Response.json({ error: message }, { status: 503 });
    }
    return Response.json(
      { error: "The answer key could not be built." },
      { status: 502 },
    );
  }
  const window = storedWindow(selected);
  extracted.conversation_ids = window.conversation_ids;
  await saveGroundTruth(session.id, extracted, window);
  return Response.json({
    ok: true,
    eligible: true,
    phase: "recall",
    window: selected.window,
    prompt: recallPrompt(selected.window, "open"),
  });
}

function storedWindow(selected: ReturnType<typeof selectWindow>): StoredWindow {
  return {
    date: selected.date,
    tz: selected.tz,
    window: selected.window,
    window_start: selected.window_start,
    window_end: selected.window_end,
    n_conversations: selected.n_conversations,
    total_minutes: selected.total_minutes,
    conversation_ids: selected.conversation_ids,
  };
}

function parseConversations(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_CONVERSATIONS) {
    return null;
  }
  let chars = 0;
  const conversations: Array<
    ConversationInput & { utterances: Array<{ speaker: string; text: string }> }
  > = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const record = item as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "number" && typeof id !== "string") {
      return null;
    }
    const utterances = Array.isArray(record.utterances)
      ? record.utterances.flatMap((utterance) => {
          if (
            !utterance ||
            typeof utterance !== "object" ||
            Array.isArray(utterance)
          ) {
            return [];
          }
          const row = utterance as Record<string, unknown>;
          const text = typeof row.text === "string" ? row.text : "";
          chars += text.length;
          return [
            {
              speaker:
                typeof row.speaker === "string" ? row.speaker : "Unknown",
              text,
            },
          ];
        })
      : [];
    if (chars > MAX_UTTERANCE_CHARS) {
      return null;
    }
    conversations.push({
      id,
      start_time: timeValue(record.start_time),
      end_time: timeValue(record.end_time),
      state: typeof record.state === "string" ? record.state : undefined,
      short_summary:
        typeof record.short_summary === "string"
          ? record.short_summary
          : undefined,
      utterances,
    });
  }
  return conversations;
}

function timeValue(value: unknown) {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  return null;
}

function transcriptText(
  conversations: Array<{
    id: number | string;
    utterances: Array<{ speaker: string; text: string }>;
  }>,
  ids: Array<number | string>,
) {
  const wanted = new Set(ids.map(String));
  return conversations
    .filter((conversation) => wanted.has(String(conversation.id)))
    .map((conversation) => {
      const lines = conversation.utterances.map(
        (utterance) => `${utterance.speaker}: ${utterance.text}`,
      );
      return `Conversation ${conversation.id}\n${lines.join("\n")}`;
    })
    .join("\n\n");
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
