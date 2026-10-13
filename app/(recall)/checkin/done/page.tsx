import type { Metadata } from "next";

import { RevealList } from "@/components/recall/reveal-list";
import { Button, Panel } from "@/components/recall/ui";
import { readReveal } from "@/lib/recall/cookies";
import { copy } from "@/lib/recall/copy";
import { recallDefaults } from "@/lib/recall/defaults";
import { requireRecall } from "@/lib/recall/guard";
import { discardReveal } from "@/lib/recall/actions";
import { listSessions } from "@/lib/recall/store";
import { cleanSessions } from "@/lib/recall/trend";

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
    <div className="space-y-4">
      <h1 className="text-[28px] font-medium tracking-tight">Wrap-up</h1>
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
