import { ScoresEditor } from "@/src/features/scoring/editor";
import { loadDossier } from "@/src/platform/recall/dossier";
import { defaultRubric } from "@/src/platform/recall/rubric";
import { latestItemScores, loadRubric } from "@/src/platform/recall/store";
import { latestDashboardScore } from "@/src/platform/scoring/persist";
import { Panel, sectionLabel } from "@/src/platform/shell/ui";

export async function ScoresPanel({ profileId }: { profileId: string }) {
  const [dossier, stored, previous, score] = await Promise.all([
    loadDossier(profileId),
    loadRubric(profileId),
    latestItemScores(profileId),
    latestDashboardScore(profileId),
  ]);
  const items = stored ?? defaultRubric(dossier.facts);
  const scores = score
    ? [
        ...score.dimensions.map((dimension) => ({
          id: dimension.id,
          label: dimension.label,
          score: dimension.display,
        })),
        ...score.custom,
      ]
    : previous;

  return (
    <section className="text-stone-400">
      <p className={sectionLabel}>Scores</p>
      <h2 className="mt-2 text-[28px] font-medium leading-8 tracking-tight text-stone-100">
        This check-in
      </h2>
      {score ? (
        <Panel className="mt-4">
          <p className="text-stone-100">Accuracy {figure(score.accuracy)}</p>
          <p className="mt-1 text-stone-100">Richness {figure(score.richness)}</p>
          {score.practice ? (
            <p className="mt-2">Practice. Saved, and not part of the trend yet.</p>
          ) : null}
          {score.recognitionHit !== null ? (
            <p className="mt-2">
              Yes/no hits {percent(score.recognitionHit)}. False alarms{" "}
              {percent(score.recognitionFalseAlarm)}.
            </p>
          ) : null}
          <ul className="mt-4 space-y-3">
            {score.dimensions.map((dimension) => (
              <li key={dimension.id} className="border-t border-white/10 pt-3">
                <p className="text-stone-100">
                  {dimension.label} {dimension.display}
                </p>
                <p className="mt-1">{dimension.reason}</p>
                {dimension.evidence ? (
                  <q className="mt-1 block text-stone-300">{dimension.evidence}</q>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel className="mt-4">
        <ScoresEditor items={items} scores={scores} />
      </Panel>
    </section>
  );
}

function figure(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
