import { finishTalk } from "@/src/features/check-in/actions";
import { ExperimentCard } from "@/src/features/experiments/card";
import { loadHomeContext } from "@/src/features/hello-world";
import { HomeComposer } from "@/src/journey/home-composer";
import { homeLaunch } from "@/src/journey/launch";
import { copy } from "@/src/platform/recall/copy";
import { requireRecall } from "@/src/platform/recall/guard";

const notices: Record<string, string> = {
  ended: copy.stopped,
  declined: copy.declined,
  distress: copy.distress,
};

export async function HomeScreen({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const notice = notices[(await searchParams).notice ?? ""] ?? "";
  const { state, script, beeDay, neededToday, lastShort } = await loadHomeContext(profile);

  return (
    <div>
      {notice ? (
        <p className="mb-4" role="status">
          {notice}
        </p>
      ) : null}
      <ExperimentCard userId={profile.id} />
      <HomeComposer
        state={state}
        name={profile.name.split(" ")[0] || profile.name}
        script={script}
        beeDay={beeDay}
        neededToday={neededToday}
        lastShort={lastShort}
        launches={homeLaunch}
        finishTalk={finishTalk}
      />
    </div>
  );
}
