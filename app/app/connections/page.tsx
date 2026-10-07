import type { ReactNode } from "react";
import Link from "next/link";

import {
  IntegrationSwitch,
  WhoopSwitch,
} from "@/components/integration-switch";
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

  const whoopSource = whoopConnection(whoop);
  const beeSource = beeConnection(bee);
  const whoopOn = whoop.status === "ok";
  const beeOn = bee.status === "ok";

  return (
    <div className="relative left-1/2 -my-8 min-h-[calc(100vh-3rem)] w-screen max-w-[100vw] -translate-x-1/2 bg-[#f2f2f7] px-6 py-8 text-[#1d1d1f]">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between">
          <Link href="/app" className="text-[13px] text-[#007aff]">
            Membership
          </Link>
          <h1 className="text-[17px] font-semibold tracking-tight">
            Integrations
          </h1>
          <span className="w-[72px]" />
        </div>

        <Section label="Sources">
          <Row
            name="WHOOP"
            detail={
              whoopOn ? "Recovery, sleep, and strain" : whoopSource.detail
            }
            control={<WhoopSwitch status={whoop.status} />}
          />
          {notice === "error" ? (
            <p className="px-4 pb-3 text-[13px] text-[#8e8e93]">
              WHOOP did not connect. Try the switch again.
            </p>
          ) : null}
          <Row
            name="Bee"
            detail={
              beeOn
                ? "Conversations, daily summary, and todos"
                : beeSource.detail
            }
            control={
              <button
                type="button"
                disabled={!beeOn}
                aria-disabled="true"
                role="switch"
                aria-checked={beeOn}
                aria-label={
                  beeOn
                    ? "Bee is on. It is read from this machine."
                    : "Bee is off. Start bee proxy on this machine."
                }
                className="cursor-default"
              >
                <IntegrationSwitch on={beeOn} disabled={!beeOn} />
              </button>
            }
          />
        </Section>

        <Section label="Later">
          {laterConnections.map((source) => (
            <Row
              key={source.name}
              name={source.name}
              detail={
                source.name === "Calendar"
                  ? "Today’s brief. Not scoring yet."
                  : "Included with WHOOP. Not separate yet."
              }
              control={
                <button
                  type="button"
                  disabled
                  role="switch"
                  aria-checked={false}
                  aria-label={`${source.name} is not available yet`}
                  className="cursor-not-allowed"
                >
                  <IntegrationSwitch on={false} disabled />
                </button>
              }
            />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="px-4 text-[13px] text-[#6d6d72] uppercase">{label}</h2>
      <div className="mt-2 overflow-hidden rounded-[10px] bg-white">
        {children}
      </div>
    </section>
  );
}

function Row({
  name,
  detail,
  control,
}: {
  name: string;
  detail: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-[#e5e5ea] px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[17px] leading-5 font-medium">{name}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-[#8e8e93]">{detail}</p>
      </div>
      {control}
    </div>
  );
}
