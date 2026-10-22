import { nudgeHistory, nudgesEnabledFor } from "@/src/platform/nudges";
import { sectionLabel } from "@/src/platform/shell/ui";

export async function NudgeInbox({ userId }: { userId: string }) {
  if (!(await nudgesEnabledFor(userId))) {
    return null;
  }
  const items = await nudgeHistory(userId, 30);

  return (
    <div>
      <p className={sectionLabel}>Nudges</p>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight">Recent notes</h1>
      {items.length === 0 ? (
        <p className="mt-4 text-stone-400">Nothing here yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((item) => (
            <li key={item.id} className="rounded-[10px] border border-white/10 p-6">
              <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
                {item.title}
              </p>
              <p className="mt-3 text-[18px] leading-7">{item.message}</p>
              <p className="mt-2 text-sm text-stone-400">
                {item.when} · {item.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
