import { respondToDecision } from "@/src/features/experiments/actions";
import { experimentCardText } from "@/src/platform/experiments/plan";
import { markDelivered, todayDecision } from "@/src/platform/experiments/store";

export async function ExperimentCard({ userId }: { userId: string }) {
  const decision = await todayDecision(userId);
  const text = experimentCardText(
    decision ? { arm: decision.arm, instruction: decision.instruction } : null,
  );
  if (!decision || !text) {
    return null;
  }
  await markDelivered(decision.id);

  return (
    <section className="mb-6 rounded-[10px] border border-white/10 p-6">
      <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
        Today
      </p>
      <p className="mt-3 text-[18px] leading-7">{text}</p>
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
    </section>
  );
}
