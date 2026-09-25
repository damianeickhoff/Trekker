"use client";

import { useEffect, useState } from "react";
import { SEGMENT_TRACK, SEGMENT_TRACK_PILL, segmentOption } from "./motion";
import { SegmentPill } from "./segment-pill";
import { useSettingFact } from "./settings/facts";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/**
 * Writes the cookie the root layout and boot script read, and flips the page
 * at once. No server round trip and no revalidation: nothing rendered on the
 * server depends on the theme except the attribute this already changed.
 */
function applyTheme(next: ThemePreference) {
  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  const resolved =
    next === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : next;
  document.documentElement.dataset.theme = resolved;
}

export function ThemePicker({ initial }: { initial: ThemePreference }) {
  const [value, setValue] = useState(initial);
  // What "system" came to here, for Settings' summaries: the boot script has set it by now.
  const [resolved, setResolved] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setResolved(document.documentElement.dataset.theme === "light" ? "light" : "dark"));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  useSettingFact("theme", value);
  useSettingFact("resolved", resolved ?? undefined);

  return (
    <div role="radiogroup" aria-label="Theme" className={SEGMENT_TRACK}>
      <SegmentPill className={SEGMENT_TRACK_PILL} />
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-segment=""
          data-on={value === o.value ? "" : undefined}
          onClick={() => {
            setValue(o.value);
            applyTheme(o.value);
          }}
          className={segmentOption}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
