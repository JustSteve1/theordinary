import { saveMood } from "@/src/features/check-in/actions";
import { copy } from "@/src/platform/recall/copy";
import { MOOD_MAX, MOOD_MIN } from "@/src/platform/recall/store";

const LABELS: Record<number, string> = {
  1: "Low",
  2: "Flat",
  3: "OK",
  4: "Good",
  5: "Great",
};

export function MoodTap({ sessionId, mood }: { sessionId: string; mood: number | null }) {
  if (mood !== null) {
    return (
      <p role="status">
        {copy.moodSaved} <span className="text-stone-200">{LABELS[mood] ?? mood}</span>.
      </p>
    );
  }
  const values = Array.from({ length: MOOD_MAX - MOOD_MIN + 1 }, (_, i) => MOOD_MIN + i);
  return (
    <form action={saveMood} className="space-y-3">
      <input type="hidden" name="session" value={sessionId} />
      <p id="mood-ask">{copy.moodAsk}</p>
      <div role="group" aria-labelledby="mood-ask" className="grid grid-cols-5 gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="submit"
            name="mood"
            value={value}
            className="rounded-xl border border-stone-700 px-2 py-3 text-center text-sm text-stone-200 hover:border-stone-500 focus:outline-none focus:ring-2 focus:ring-[#0a84ff]"
          >
            <span className="block text-lg font-medium">{value}</span>
            <span className="block text-xs text-stone-400">{LABELS[value]}</span>
          </button>
        ))}
      </div>
    </form>
  );
}
