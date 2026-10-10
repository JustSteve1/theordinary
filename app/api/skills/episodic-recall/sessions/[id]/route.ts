import { getCurrentUser } from "@/lib/users";
import {
  asRecall,
  extractDocument,
  recallFactPrompt,
} from "@/lib/skills/episodic-recall/extract";
import {
  abortReply,
  advanceRecall,
  consentReply,
  finishRecall,
  phasePrompt,
  recallStep,
  waitingReply,
  type Phase,
  type SkillReply,
} from "@/lib/skills/episodic-recall/machine";
import { recallPrompt } from "@/lib/skills/episodic-recall/prompts";
import type { RecallScore } from "@/lib/skills/episodic-recall/score";
import { localDate, shiftDate } from "@/lib/skills/episodic-recall/window";
import type { WindowName } from "@/lib/skills/episodic-recall/window";
import {
  abortSession,
  closeSession,
  completeScore,
  latestResult,
  loadSkillSession,
  priorResults,
  savePhase,
  saveRecallRaw,
  takeReveal,
  type StoredResult,
  type StoredSession,
} from "@/lib/skills/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }
  const session = await loadSkillSession((await context.params).id, user.id);
  if (!session) {
    return Response.json(
      { error: "That check-in does not exist." },
      { status: 404 },
    );
  }
  return Response.json(await replyFor(session));
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }
  const session = await loadSkillSession((await context.params).id, user.id);
  if (!session) {
    return Response.json(
      { error: "That check-in does not exist." },
      { status: 404 },
    );
  }
  const body = await readJson(request);
  if (!body) {
    return Response.json({ error: "Send a JSON body." }, { status: 400 });
  }
  const action = stringValue(body.action);
  if (action === "consent") {
    return consent(session, body.accepted === true);
  }
  if (action === "confounders") {
    return confounders(session, body);
  }
  if (action === "recall") {
    return recall(session, stringValue(body.text) ?? "");
  }
  if (action === "reveal") {
    return reveal(session);
  }
  if (action === "abort") {
    return abort(session);
  }
  return Response.json(
    { error: "That action is not part of this check-in." },
    { status: 400 },
  );
}

async function consent(session: StoredSession, accepted: boolean) {
  if (session.phase !== "consent") {
    return wrongPhase();
  }
  const reply = consentReply(session.id, accepted);
  if (!accepted) {
    await closeSession(session.id, "declined");
    return Response.json(reply);
  }
  await savePhase(session.id, "confounders");
  return Response.json(reply);
}

async function confounders(
  session: StoredSession,
  body: Record<string, unknown>,
) {
  if (session.phase !== "confounders") {
    return wrongPhase();
  }
  if (
    typeof body.poor_sleep !== "boolean" ||
    typeof body.unwell_or_alcohol !== "boolean"
  ) {
    return Response.json(
      { error: "Answer both questions with yes or no." },
      { status: 400 },
    );
  }
  const targetDate = shiftDate(localDate(Date.now(), session.timezone), -1);
  await savePhase(session.id, "awaiting_capture", {
    targetDate,
    confounders: {
      poor_sleep: body.poor_sleep,
      unwell_or_alcohol: body.unwell_or_alcohol,
    },
  });
  return Response.json(waitingReply(session.id));
}

async function recall(session: StoredSession, text: string) {
  const step = recallStep(session.phase);
  if (!step || !session.window || !session.targetDate) {
    return wrongPhase();
  }
  const answer = text.trim();
  if (!answer) {
    return Response.json(
      { error: "Say what you remember, or stop the check-in." },
      { status: 400 },
    );
  }
  const recallRaw = session.recallRaw
    ? `${session.recallRaw}\n${answer}`
    : answer;
  const next = advanceRecall(session.phase);
  if (next) {
    await saveRecallRaw(session.id, next, recallRaw);
    return Response.json({
      id: session.id,
      phase: next,
      prompt: recallPrompt(
        session.window.window,
        next === "followup_1" ? "followup_1" : "followup_2",
      ),
    } satisfies SkillReply);
  }
  if (!session.groundTruth) {
    return Response.json(
      { error: "This check-in has no answer key." },
      { status: 409 },
    );
  }
  let extracted: ReturnType<typeof asRecall>;
  try {
    extracted = asRecall(
      await extractDocument(
        recallFactPrompt(recallRaw, session.targetDate, session.window.window),
      ),
      session.targetDate,
      session.window.window,
    );
  } catch (error) {
    return extractionError(error);
  }
  const finished = finishRecall({
    id: session.id,
    window: session.window.window,
    groundTruth: session.groundTruth,
    recall: extracted,
    prior: await priorResults(session.userId),
    confounders: session.confounders ?? {},
  });
  await completeScore({
    sessionId: session.id,
    userId: session.userId,
    targetDate: session.targetDate,
    window: session.window.window,
    conversationIds: session.window.conversation_ids,
    result: finished.result,
    reveal: finished.reveal,
  });
  return Response.json(finished.reply);
}

async function reveal(session: StoredSession) {
  if (session.phase !== "feedback") {
    return wrongPhase();
  }
  const items = await takeReveal(session.id);
  const reply = await replyFor({
    ...session,
    phase: "complete",
    revealItems: [],
  });
  return Response.json({ ...reply, reveal: items });
}

async function abort(session: StoredSession) {
  if (!isOpen(session.phase)) {
    return wrongPhase();
  }
  await abortSession({
    sessionId: session.id,
    userId: session.userId,
    targetDate: session.targetDate,
    window: session.window?.window ?? null,
    conversationIds: session.window?.conversation_ids ?? [],
  });
  return Response.json(abortReply(session.id));
}

async function replyFor(session: StoredSession): Promise<SkillReply> {
  const result =
    session.phase === "feedback" || session.phase === "complete"
      ? await latestResult(session.id)
      : null;
  return phasePrompt({
    id: session.id,
    phase: session.phase,
    window: session.window?.window ?? null,
    score: result
      ? scoreView(result, session.window?.window ?? "afternoon")
      : null,
    trend: result?.trend ?? null,
    confounders: session.confounders,
  });
}

function scoreView(result: StoredResult, window: WindowName): RecallScore {
  return {
    date: result.targetDate ?? undefined,
    window,
    n_truth: result.nTruth ?? 0,
    n_core: result.nCore ?? 0,
    n_recall: result.nRecall ?? 0,
    core_recall: result.coreRecall,
    detail_recall: result.detailRecall,
    overall_recall: null,
    intrusion_rate: result.intrusionRate ?? 0,
    unsure_rate: result.unsureRate ?? 0,
    per_type_recall: result.perTypeRecall ?? {},
    composite: result.composite ?? 0,
    thresholds: { same_type: 0.6, cross_type: 0.8 },
    matches: [],
    misses: [],
    intrusions: [],
  };
}

function extractionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Chat is not configured on this server.") {
    return Response.json({ error: message }, { status: 503 });
  }
  return Response.json(
    { error: "The check-in could not be scored. Try that answer again." },
    { status: 502 },
  );
}

function wrongPhase() {
  return Response.json(
    { error: "That step does not match this check-in." },
    { status: 409 },
  );
}

function isOpen(phase: Phase) {
  return (
    phase === "consent" ||
    phase === "confounders" ||
    phase === "awaiting_capture" ||
    phase === "recall" ||
    phase === "followup_1" ||
    phase === "followup_2" ||
    phase === "feedback"
  );
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

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}
