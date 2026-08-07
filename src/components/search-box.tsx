"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function SearchBox({ initialQuery = "" }: { initialQuery?: string }) {
  const [value, setValue] = useState(initialQuery);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // Debounce so we are not firing a search on every keystroke.
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === initialQuery) return;

    const id = setTimeout(() => {
      startTransition(() => {
        router.replace(trimmed ? `/discover?q=${encodeURIComponent(trimmed)}` : "/discover");
      });
    }, 350);

    return () => clearTimeout(id);
  }, [value, initialQuery, router]);

  return (
    <div className="relative">
      <Search
        size={18}
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-400"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search movies and shows…"
        aria-label="Search movies and shows"
        className="w-full rounded-2xl border border-ink-700 bg-ink-900/70 py-3.5 pr-11 pl-11 text-sm outline-none transition placeholder:text-ink-600 focus:border-flare-500 focus:ring-2 focus:ring-flare-600/30"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
