import { interactWithNudge } from "@/src/features/nudges/actions";
import { activeNudges } from "@/src/platform/nudges";

export async function NudgeCard({ userId }: { userId: string }) {
  const [nudge] = await activeNudges(userId, 1);
  if (!nudge) {
    return null;
  }

  return (
    <section className="mb-6 rounded-[10px] border border-white/10 p-6">
      <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
        {nudge.title}
      </p>
      <p className="mt-3 text-[18px] leading-7">{nudge.message}</p>
      <p className="mt-2 text-sm text-stone-400">{nudge.when}</p>
      <form action={interactWithNudge} className="mt-4 flex flex-wrap items-center gap-4">
        <input type="hidden" name="nudge" value={nudge.id} />
        <button
          name="action"
          value="thanks"
          className="rounded-full bg-[#0a84ff] px-4 py-2 text-sm font-medium text-white"
          type="submit"
        >
          Thanks
        </button>
        <button name="action" value="helpful" className="text-[#0a84ff]" type="submit">
          Helpful
        </button>
        <button name="action" value="not_for_me" className="text-[#0a84ff]" type="submit">
          Not for me
        </button>
      </form>
    </section>
  );
}
