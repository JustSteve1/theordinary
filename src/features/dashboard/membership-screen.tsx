import { loadBee } from "@/src/platform/integrations/bee";
import { loadWhoop } from "@/src/platform/integrations/whoop";
import { WEEK_GOAL, scoreMembership } from "@/src/features/dashboard/score";
import { getCurrentUser } from "@/src/platform/current-user";
import { redirect } from "next/navigation";

export async function MembershipScreen() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [bee, whoop] = await Promise.all([
    loadBee(user.id),
    loadWhoop(user.id),
  ]);
  const membership = scoreMembership({ now: Date.now(), bee, whoop });
  const progress = Math.min(
    100,
    Math.round((membership.points / WEEK_GOAL) * 100),
  );

  return (
    <div className="space-y-4">
      <section className="rounded-[10px] border border-white/10 bg-white/[0.03] p-6">
        <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          Membership
        </p>
        <h1 className="mt-3 text-[28px] font-medium tracking-tight">
          {user.name}
        </h1>
        <p className="mt-1 text-stone-400">{membership.tier}</p>
        <p className="mt-6 text-[22px] tracking-tight">
          {membership.points}
          <span className="ml-2 text-[13px] text-stone-500">
            of {WEEK_GOAL} this week
          </span>
        </p>
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"
          role="meter"
          aria-valuenow={membership.points}
          aria-valuemin={0}
          aria-valuemax={WEEK_GOAL}
          aria-label="Points this week"
        >
          <div
            className="h-full bg-[#0a84ff]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>

      <section className="rounded-[10px] border border-white/10 p-6">
        <h2 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          This week
        </h2>
        {membership.ledger.length === 0 ? (
          <p className="mt-4 text-[13px] text-stone-400">
            Nothing has scored yet this week.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {membership.ledger.map((row, index) => (
              <li
                key={`${row.label}-${row.detail}-${index}`}
                className="flex items-baseline justify-between gap-4 py-3"
              >
                <div>
                  <p>{row.label}</p>
                  <p className="mt-1 text-stone-400">{row.detail}</p>
                </div>
                <p className="shrink-0 text-stone-300 tabular-nums">
                  {row.points}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[10px] border border-white/10 p-6">
        <h2 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          Open
        </h2>
        {bee.openTodos.length === 0 ? (
          <p className="mt-4 text-[13px] text-stone-400">No open todos.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {bee.openTodos.map((todo, index) => (
              <li key={`${todo}-${index}`} className="text-[13px] leading-5">
                {todo}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[10px] border border-white/10 bg-black p-6">
        <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          {membership.tier === "Black" ? "Open" : "Locked"}
        </p>
        <h2 className="mt-3 text-[22px] font-medium tracking-tight">Black</h2>
        <p className="mt-3 max-w-md text-[13px] leading-5 text-stone-300">
          {membership.tier === "Black"
            ? "A reserved table, a car, and a quiet hour are yours this week."
            : "A reserved table, a car, and a quiet hour. Black opens at 100 points this week."}
        </p>
      </section>
    </div>
  );
}
