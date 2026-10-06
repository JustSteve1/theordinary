import Link from "next/link";

import { rememberTimezone } from "@/lib/auth/users";
import { loadBee } from "@/lib/integrations/bee/client";
import {
  beeConnection,
  laterConnections,
  whoopConnection,
} from "@/lib/integrations/connections";
import { loadWhoop } from "@/lib/integrations/whoop/client";
import { getCurrentUser } from "@/lib/users";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ whoop?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const notice = (await searchParams).whoop;
  const [bee, whoop] = await Promise.all([loadBee(), loadWhoop(user.id)]);
  if (bee.status === "ok" && bee.timezone && bee.timezone !== user.timezone) {
    await rememberTimezone(user.id, bee.timezone);
  }

  const sources = [whoopConnection(whoop), beeConnection(bee)];

  return (
    <div className="space-y-4">
      <section className="rounded-[10px] border border-white/10 bg-white/[0.03] p-6">
        <p className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          Connections
        </p>
        <h1 className="mt-3 text-[28px] font-medium tracking-tight">Sources</h1>
        <p className="mt-3 max-w-md text-[13px] leading-5 text-stone-400">
          WHOOP and Bee score this week. The next sources will be configured
          here too.
        </p>
        <Link href="/app" className="mt-6 inline-block text-[#0a84ff]">
          Membership
        </Link>
      </section>

      {sources.map((source) => (
        <section
          key={source.name}
          className="rounded-[10px] border border-white/10 p-6"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[22px] font-medium tracking-tight">
              {source.name}
            </h2>
            <p className="text-[13px] text-stone-400">{source.label}</p>
          </div>
          <p className="mt-3 max-w-md text-[13px] leading-5 text-stone-300">
            {source.detail}
          </p>
          {source.name === "WHOOP" ? (
            <WhoopActions status={whoop.status} notice={notice} />
          ) : null}
        </section>
      ))}

      <section className="rounded-[10px] border border-white/10 p-6">
        <h2 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          Later
        </h2>
        <ul className="mt-4 divide-y divide-white/10">
          {laterConnections.map((source) => (
            <li key={source.name} className="py-3">
              <div className="flex items-baseline justify-between gap-4">
                <p>{source.name}</p>
                <p className="text-[13px] text-stone-500">Not yet</p>
              </div>
              <p className="mt-1 text-[13px] leading-5 text-stone-400">
                {source.detail}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function WhoopActions({
  status,
  notice,
}: {
  status: "unconfigured" | "disconnected" | "error" | "ok";
  notice?: string;
}) {
  return (
    <div className="mt-6 space-y-3">
      {status === "ok" ? (
        <form action="/api/whoop/disconnect" method="post">
          <button type="submit" className="text-[#0a84ff]">
            Disconnect
          </button>
        </form>
      ) : status === "unconfigured" ? null : (
        <a href="/api/whoop/connect" className="text-[#0a84ff]">
          Connect
        </a>
      )}
      {notice === "error" ? (
        <p className="text-[13px] text-stone-400">
          WHOOP did not connect. Try again.
        </p>
      ) : null}
      {notice === "unconfigured" ? (
        <p className="text-[13px] text-stone-400">
          Add WHOOP client credentials before connecting.
        </p>
      ) : null}
    </div>
  );
}
