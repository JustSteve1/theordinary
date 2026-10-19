import { Panel, sectionLabel } from "@/src/platform/shell/ui";
import { listCheckins } from "@/src/platform/recall/store";

export async function CheckinPanel({ profileId }: { profileId: string }) {
  const checkins = await listCheckins(profileId);
  const body = checkins.map((checkin) => ({
    time: checkin.time,
    duration: checkin.duration,
    narrative: checkin.narrative,
    questions: checkin.questions.map((turn) => ({
      question: turn.question,
      answer: turn.answer,
    })),
  }));

  return (
    <section className="text-stone-400">
      <p className={sectionLabel}>Check-ins</p>
      <h2 className="mt-2 text-[28px] font-medium leading-8 tracking-tight text-stone-100">
        Saved talks
      </h2>
      <Panel className="mt-4">
        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-stone-100">
          {JSON.stringify(body, null, 2)}
        </pre>
      </Panel>
    </section>
  );
}
