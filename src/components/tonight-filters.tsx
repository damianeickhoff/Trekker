"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Clock, Monitor } from "lucide-react";
import type { TonightFilters } from "@/lib/tonight";

/**
 * The three questions worth asking about tonight: how long, what kind, and
 * whether it has to be something you can actually press play on.
 *
 * State lives in the URL rather than in the component, so a set of filters can
 * be bookmarked or shared and the back button behaves. Changing anything also
 * resets the roll — a new set of candidates deserves a fresh draw rather than
 * whatever the last one happened to land on.
 */

const RUNTIMES = [
  { value: "", label: "Any length" },
  { value: "45", label: "Under 45m" },
  { value: "70", label: "Under 70m" },
  { value: "100", label: "Under 100m" },
  { value: "130", label: "Under 2h10" },
];

const KINDS = [
  { value: "all", label: "Everything" },
  { value: "movie", label: "Films" },
  { value: "tv", label: "Shows" },
];

export function TonightFilterBar({
  filters,
  noProviders,
}: {
  filters: TonightFilters;
  noProviders: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("roll");
    router.replace(`/tonight?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 p-3.5">
      <label className="flex items-center gap-2 text-sm">
        <Clock size={15} className="text-ink-400" />
        <select
          value={filters.maxRuntime === null ? "" : String(filters.maxRuntime)}
          onChange={(event) => apply("runtime", event.target.value)}
          className="rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm text-ink-100 light:bg-white"
        >
          {RUNTIMES.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1 rounded-lg border border-ink-700 p-0.5">
        {KINDS.map((kind) => (
          <button
            key={kind.value}
            type="button"
            onClick={() => apply("kind", kind.value === "all" ? "" : kind.value)}
            className={`rounded-md px-2.5 py-1 text-sm transition ${
              filters.kind === kind.value
                ? "bg-flare-600 font-medium text-white"
                : "text-ink-300 hover:bg-ink-800"
            }`}
          >
            {kind.label}
          </button>
        ))}
      </div>

      <label
        className={`flex items-center gap-2 text-sm ${
          noProviders ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
        // Without a subscription on file this filter can only ever return
        // nothing, so it says why rather than looking broken.
        title={
          noProviders
            ? "Pick the services you subscribe to in settings first"
            : "Only what one of your services carries"
        }
      >
        <Monitor size={15} className="text-ink-400" />
        <input
          type="checkbox"
          disabled={noProviders}
          checked={filters.streamableOnly}
          onChange={(event) => apply("streaming", event.target.checked ? "1" : "")}
          className="h-4 w-4 accent-flare-600"
        />
        On my services
      </label>
    </div>
  );
}
