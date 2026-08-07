"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { ACCENTS } from "@/lib/accents";
import { saveAccent, saveTheme } from "@/lib/theme-actions";

export type Theme = "dark" | "light" | "system";

function resolve(theme: Theme): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = resolve(theme);
}

/** Violet is the ramp's own colour, so it is the absence of an attribute. */
function applyAccent(accent: string) {
  if (accent === "violet") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = accent;
}

/**
 * Keeps a "system" choice honest. The server renders whatever the OS preference
 * resolved to last time; if it has changed since, this corrects the page and
 * writes the new resolution back so the next load is right from the first byte.
 *
 * Mounted in the root layout, because the OS can change on any page — not only
 * on the one with the switcher.
 */
export function ThemeSync({ theme }: { theme: Theme }) {
  useEffect(() => {
    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: light)");

    const sync = () => {
      const next = resolve("system");
      if (document.documentElement.dataset.theme === next) return;
      apply("system");
      void saveTheme("system", next);
    };

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);

  return null;
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeSwitcher({ current }: { current: Theme }) {
  const [theme, setThemeState] = useState<Theme>(current);

  function setTheme(next: Theme) {
    setThemeState(next);
    // Applied straight away; the write is what makes it survive a reload.
    apply(next);
    void saveTheme(next, resolve(next));
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex rounded-xl border border-ink-700 bg-ink-900/60 p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              active
                ? "bg-flare-600 text-white"
                : "text-ink-300 hover:bg-ink-800 hover:text-ink-100"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The accent colour. Applied to <html> the moment it is picked, exactly as the
 * theme is, so the whole page turns over at once instead of waiting for a round
 * trip to the server.
 *
 * Swatches rather than names: the choice is entirely about how it looks, and a
 * list of words asks the reader to imagine the answer.
 */
export function AccentPicker({
  current,
  seasonal,
}: {
  current: string;
  /** A costume is on, and is overriding whatever is chosen here. */
  seasonal?: boolean;
}) {
  const [accent, setAccent] = useState(current);

  function choose(next: string) {
    setAccent(next);
    // Applied straight away; the write is what makes it survive a reload.
    applyAccent(next);
    void saveAccent(next);
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2">
        {ACCENTS.map((option) => {
          const active = accent === option.id;
          return (
            <button
              key={option.id}
              role="radio"
              aria-checked={active}
              aria-label={option.label}
              title={option.label}
              onClick={() => choose(option.id)}
              style={{ backgroundColor: option.swatch }}
              className={`grid h-9 w-9 place-items-center rounded-xl text-white transition ${
                active
                  ? "ring-2 ring-ink-100 ring-offset-2 ring-offset-ink-950"
                  : "opacity-80 hover:opacity-100"
              }`}
            >
              {active && <Check size={16} />}
            </button>
          );
        })}
      </div>

      {seasonal && (
        <p className="mt-2 text-xs text-ink-400">
          A seasonal theme is on at the moment and is using its own colour. Yours comes back
          when it ends.
        </p>
      )}
    </div>
  );
}

