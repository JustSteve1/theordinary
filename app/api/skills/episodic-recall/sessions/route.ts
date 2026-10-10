import { getCurrentUser } from "@/lib/users";
import { startReply } from "@/lib/skills/episodic-recall/machine";
import { createSkillSession, openSkillSession } from "@/lib/skills/store";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }
  if (await openSkillSession(user.id)) {
    return Response.json(
      { error: "A memory check-in is already open." },
      { status: 409 },
    );
  }
  try {
    const id = await createSkillSession(
      user.id,
      user.timezone || "Europe/London",
    );
    return Response.json(startReply(id));
  } catch (error) {
    if (isUnique(error)) {
      return Response.json(
        { error: "A memory check-in is already open." },
        { status: 409 },
      );
    }
    throw error;
  }
}

function isUnique(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505",
  );
}
