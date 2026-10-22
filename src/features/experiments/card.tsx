import { respondToDecision } from "@/src/features/experiments/actions";
import { DayCard, DOMAIN_LABEL } from "@/src/features/nudges/day-card";
import { beeAnchorFor } from "@/src/platform/experiments/anchor";
import { experimentCardText } from "@/src/platform/experiments/plan";
import { markDelivered, todayDecisions } from "@/src/platform/experiments/store";

export async function ExperimentCard({ userId }: { userId: string }) {
  const decisions = await todayDecisions(userId);
  if (decisions.length === 0) {
    return null;
  }
  const needsAnchor = decisions.some(
    (decision) => decision.domain === "mindset" && decision.arm === "treatment",
  );
  const anchor = needsAnchor ? await beeAnchorFor(userId) : null;

  const cards = [];
  for (const decision of decisions) {
    const text = experimentCardText({ arm: decision.arm, instruction: decision.instruction });
    if (!text) {
      continue;
    }
    await markDelivered(decision.id);
    const treated = decision.arm === "treatment";
    cards.push(
      <DayCard
        key={decision.id}
        eyebrow={treated ? "Today's nudge" : "Today"}
        tag={decision.domain ? DOMAIN_LABEL[decision.domain] : null}
        footer={
          decision.response ? (
            <p className="mt-4 text-sm text-stone-400">
              {decision.response === "done" ? "Marked done. Nice." : "Skipped today."}
            </p>
          ) : (
            <form action={respondToDecision} className="mt-4 flex gap-3">
              <input type="hidden" name="decision" value={decision.id} />
              <button
                name="response"
                value="done"
                className="rounded-full bg-[#0a84ff] px-4 py-2 text-sm font-medium text-white"
                type="submit"
              >
                Done
              </button>
              <button name="response" value="skipped" className="text-[#0a84ff]" type="submit">
                Skipped
              </button>
            </form>
          )
        }
      >
        <p>{text}</p>
        {treated && decision.domain === "mindset" && anchor ? (
          <p className="mt-2 text-sm text-stone-400">{anchor.line}</p>
        ) : null}
      </DayCard>,
    );
  }
  return <>{cards}</>;
}
