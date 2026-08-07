"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveProviders } from "@/lib/provider-actions";

/**
 * Which streaming services you pay for. Used to warn before requesting
 * something you could already be watching tonight.
 */
export function ProviderPicker({
  all,
  initial,
}: {
  all: { id: number; name: string }[];
  initial: number[];
}) {
  const [chosen, setChosen] = useState<number[]>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggle(id: number) {
    const next = chosen.includes(id) ? chosen.filter((v) => v !== id) : [...chosen, id];
    setChosen(next);
    setSaved(false);

    startTransition(async () => {
      await saveProviders(next);
      setSaved(true);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {all.map((provider) => {
          const on = chosen.includes(provider.id);
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => toggle(provider.id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                on
                  ? "border-flare-500 bg-flare-600/20 text-flare-300"
                  : "border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
              }`}
            >
              {on && <Check size={13} />}
              {provider.name}
            </button>
          );
        })}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
        {pending ? (
          <>
            <Loader2 size={12} className="animate-spin" /> Saving…
          </>
        ) : saved ? (
          "Saved."
        ) : chosen.length === 0 ? (
          "Nothing selected, so no warnings before requesting."
        ) : (
          `${chosen.length} selected.`
        )}
      </p>
    </div>
  );
}
