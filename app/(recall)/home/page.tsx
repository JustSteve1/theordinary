import type { Metadata } from "next";

import { HomeCard } from "@/components/recall/home-card";
import { copy } from "@/lib/recall/copy";
import { requireRecall } from "@/lib/recall/guard";
import { loadHomeContext } from "@/lib/recall/status";

export const metadata: Metadata = { title: "Home" };

const notices: Record<string, string> = {
  ended: copy.stopped,
  declined: copy.declined,
  distress: copy.distress,
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const profile = await requireRecall({ min: "done", max: "done" });
  const notice = notices[(await searchParams).notice ?? ""] ?? "";
  const { state, quietBee } = await loadHomeContext(profile);

  return (
    <div>
      {notice ? (
        <p className="mb-4" role="status">
          {notice}
        </p>
      ) : null}
      <HomeCard
        state={state}
        name={profile.name.split(" ")[0] || profile.name}
        quietBee={quietBee}
      />
    </div>
  );
}
