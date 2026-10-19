import { ScoresEditor } from "@/src/features/scoring/editor";
import { loadDossier } from "@/src/platform/recall/dossier";
import { defaultRubric } from "@/src/platform/recall/rubric";
import { latestItemScores, loadRubric } from "@/src/platform/recall/store";
import { Panel, sectionLabel } from "@/src/platform/shell/ui";

export async function ScoresPanel({ profileId }: { profileId: string }) {
  const [dossier, stored, scores] = await Promise.all([
    loadDossier(profileId),
    loadRubric(profileId),
    latestItemScores(profileId),
  ]);
  const items = stored ?? defaultRubric(dossier.facts);

  return (
    <section className="text-stone-400">
      <p className={sectionLabel}>Scores</p>
      <h2 className="mt-2 text-[28px] font-medium leading-8 tracking-tight text-stone-100">
        This check-in
      </h2>
      <Panel className="mt-4">
        <ScoresEditor items={items} scores={scores} />
      </Panel>
    </section>
  );
}
