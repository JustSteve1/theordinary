"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveScoreItems } from "@/src/features/scoring/actions";
import type { RubricItem } from "@/src/platform/recall/rubric";

export function ScoresEditor({
  items,
  scores,
}: {
  items: RubricItem[];
  scores: { id: string; label: string; score: number }[] | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(items);
  const [label, setLabel] = useState("");
  const [words, setWords] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function persist(next: RubricItem[]) {
    setPending(true);
    setError(null);
    const result = await saveScoreItems(next);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft(next);
    router.refresh();
  }

  return (
    <div className="mt-4">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-stone-100">
        {JSON.stringify(
          (scores ?? []).map((item) => ({
            id: item.id,
            label: item.label,
            score: item.score,
          })),
          null,
          2,
        )}
      </pre>
      <ul className="mt-4 space-y-3">
        {draft.map((item) => (
          <li key={item.id} className="border-t border-white/10 pt-3">
            <div className="flex items-center gap-3">
              <input
                aria-label={`Name for ${item.label}`}
                defaultValue={item.label}
                disabled={pending}
                onBlur={(event) => {
                  const nextLabel = event.target.value.trim();
                  if (!nextLabel || nextLabel === item.label) {
                    event.target.value = item.label;
                    return;
                  }
                  void persist(
                    draft.map((row) =>
                      row.id === item.id ? { ...row, label: nextLabel } : row,
                    ),
                  );
                }}
                className="h-11 w-full rounded-[10px] border border-white/15 bg-transparent px-3 text-stone-100 outline-none focus:border-[#0a84ff]"
              />
              <button
                type="button"
                className="min-h-11 shrink-0 text-[#0a84ff]"
                disabled={pending}
                onClick={() => void persist(draft.filter((row) => row.id !== item.id))}
              >
                Remove
              </button>
            </div>
            {item.terms.length > 0 ? (
              <p className="mt-1 text-stone-500">{item.terms.join(", ")}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="mt-4 space-y-3 border-t border-white/10 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          const nextLabel = label.trim();
          if (!nextLabel || pending) {
            return;
          }
          const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
          const terms = words
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((word) => word.length >= 4);
          setLabel("");
          setWords("");
          void persist([...draft, { id, label: nextLabel, terms }]);
        }}
      >
        <input
          aria-label="New score item"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="New item"
          className="h-11 w-full rounded-[10px] border border-white/15 bg-transparent px-3 text-stone-100 outline-none focus:border-[#0a84ff]"
        />
        <input
          aria-label="Words for the new score item"
          value={words}
          onChange={(event) => setWords(event.target.value)}
          placeholder="Words, separated by commas"
          className="h-11 w-full rounded-[10px] border border-white/15 bg-transparent px-3 text-stone-100 outline-none focus:border-[#0a84ff]"
        />
        <button type="submit" className="min-h-11 text-[#0a84ff]" disabled={pending}>
          Add
        </button>
      </form>
      {error ? (
        <p className="mt-3 text-[#ffb4ab]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
