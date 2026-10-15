import type { Metadata } from "next";

import { RevealList } from "@/src/features/check-in/reveal-list";
import { Button, Panel } from "@/src/platform/shell/ui";
import { readReveal } from "@/src/platform/recall/cookies";
import { copy } from "@/src/platform/recall/copy";
import { recallDefaults } from "@/src/platform/recall/defaults";
import { requireRecall } from "@/src/platform/recall/guard";
import { discardReveal } from "@/src/features/check-in/actions";
import { listSessions } from "@/src/platform/recall/store";
import { cleanSessions } from "@/src/platform/recall/trend";

export const metadata: Metadata = { title: "Wrap-up" };

export default async function WrapUpPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const sessionId = (await searchParams).session;
  const sessions = await listSessions(profile.id);
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    return (
      <Panel>
        <p>This check-in isn’t available.</p>
        <form action={discardReveal} className="mt-4">
          <input type="hidden" name="to" value="home" />
          <Button type="submit">Back to home</Button>
        </form>
      </Panel>
    );
  }

  const reveal = await readReveal();
  const cleanCount = cleanSessions(sessions).length;
  const showReview = session.trend.flag === "review_suggested";

  return (
    <div className="space-y-4 text-stone-400">
      <h1 className="text-[28px] font-medium tracking-tight text-stone-100">Wrap-up</h1>
      <Panel className="space-y-4">
        <p>{copy.wrapUp}</p>
        {cleanCount < recallDefaults.minBaseline ? (
          <p>
            That’s check-in {cleanCount} of {recallDefaults.minBaseline} towards
            your baseline. {copy.baselineHint}
          </p>
        ) : null}
        <RevealList items={reveal?.missed ?? []} />
        {showReview ? <p>{copy.reviewNotice}</p> : null}
        <form action={discardReveal}>
          <input type="hidden" name="to" value="home" />
          <Button type="submit" className="w-full">
            Back to home
          </Button>
        </form>
        <form action={discardReveal}>
          <input type="hidden" name="to" value="dashboard" />
          <Button type="submit" variant="secondary" className="w-full">
            View dashboard
          </Button>
        </form>
      </Panel>
    </div>
  );
}
