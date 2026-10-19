"use client";

import { useEffect, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  async function persist(next: RubricItem[]) {
    setPending(true);
    setError(null);
    const result = await saveScoreItems(next);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return false;
    }
    setDraft(next);
    router.refresh();
    return true;
  }

  return (
    <div className="mt-4" data-scores-ready={ready ? "true" : "false"}>
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
                disabled={pending || !ready}
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
                disabled={pending || !ready}
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
      <div className="mt-4 space-y-3 border-t border-white/10 pt-3">
        <input
          name="label"
          aria-label="New score item"
          placeholder="New item"
          className="h-11 w-full rounded-[10px] border border-white/15 bg-transparent px-3 text-stone-100 outline-none focus:border-[#0a84ff]"
        />
        <input
          name="words"
          aria-label="Words for the new score item"
          placeholder="Words, separated by commas"
          className="h-11 w-full rounded-[10px] border border-white/15 bg-transparent px-3 text-stone-100 outline-none focus:border-[#0a84ff]"
        />
        <button
          type="button"
          aria-label="Add score item"
          className="min-h-11 text-[#0a84ff]"
          disabled={pending || !ready}
          onClick={(event) => {
            const root = event.currentTarget.parentElement;
            const nextLabel = (
              root?.querySelector('input[name="label"]') as HTMLInputElement | null
            )?.value.trim() ?? "";
            const nextWords =
              (root?.querySelector('input[name="words"]') as HTMLInputElement | null)?.value ??
              "";
            if (!nextLabel || pending) {
              return;
            }
            const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
            const terms = nextWords
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter((word) => word.length >= 4);
            const labelInput = root?.querySelector('input[name="label"]') as HTMLInputElement | null;
            const wordsInput = root?.querySelector('input[name="words"]') as HTMLInputElement | null;
            if (labelInput) {
              labelInput.value = "";
            }
            if (wordsInput) {
              wordsInput.value = "";
            }
            void persist([...draft, { id, label: nextLabel, terms }]);
          }}
        >
          Add
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-[#ffb4ab]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
