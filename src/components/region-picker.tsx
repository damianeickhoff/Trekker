"use client";

import { useActionState } from "react";
import { saveRegion } from "@/lib/settings-actions";

/**
 * Which country's streaming availability to show this account.
 *
 * A curated list rather than a free text field: TMDB only answers for regions
 * it knows, and a typo would silently show an empty catalogue. Labels come
 * from the browser's own `Intl.DisplayNames`, so nothing here goes stale and
 * everyone reads country names in their own language.
 */
const REGIONS = [
  "US", "CA", "MX", "BR", "AR", "CL", "CO",
  "GB", "IE", "FR", "DE", "AT", "CH", "NL", "BE", "LU",
  "ES", "PT", "IT", "GR", "TR",
  "DK", "SE", "NO", "FI", "IS",
  "PL", "CZ", "SK", "HU", "RO",
  "IN", "JP", "KR", "TW", "HK", "SG", "MY", "TH", "PH", "ID",
  "AU", "NZ", "ZA", "IL", "AE", "SA",
];

export function RegionPicker({
  current,
  instanceRegion,
}: {
  /** The account's own setting, or null when it follows the instance. */
  current: string | null;
  instanceRegion: string;
}) {
  const [state, act, pending] = useActionState(saveRegion, {});

  const names = new Intl.DisplayNames(undefined, { type: "region" });
  const label = (code: string) => {
    try {
      return names.of(code) ?? code;
    } catch {
      return code;
    }
  };

  return (
    <form action={act} className="space-y-3">
      <div className="flex gap-2">
        <select
          name="region"
          defaultValue={current ?? ""}
          className="min-w-0 flex-1 rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2.5 text-sm outline-none focus:border-flare-500"
        >
          <option value="">
            Same as this instance — {label(instanceRegion)}
          </option>
          {REGIONS.map((code) => (
            <option key={code} value={code}>
              {label(code)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-ink-700 px-3.5 py-2 text-sm text-ink-200 transition hover:border-flare-500 hover:bg-ink-800 disabled:opacity-50"
        >
          Save
        </button>
      </div>

      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      {state.ok && <p className="text-xs text-flare-400">{state.ok}</p>}

      <p className="text-[11px] text-ink-500">
        Decides whose streaming catalogue the app answers from — the strip on title pages, the
        watchlist&rsquo;s &ldquo;streaming now&rdquo;, smart lists filtered by service, and what
        auto-request treats as already covered.
      </p>
    </form>
  );
}
