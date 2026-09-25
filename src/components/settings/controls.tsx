"use client";

import { useState, useTransition, type CSSProperties } from "react";
import {
  BACKGROUND_HUES,
  BACKGROUND_VARIANTS,
  backgroundArtUrl,
  type Background,
  type BackgroundVariant,
} from "@/lib/background";
import { saveBackground, saveNotify, saveRegion, saveScreensaverIdle, saveServices, type SaveOutcome } from "@/lib/settings-actions";
import type { NotifyTopic } from "@/lib/settings";
import { applyBackground } from "../background-sync";
import { Icon } from "../icon";
import { useSettingFact } from "./facts";
import { PRESS, SEGMENT_TRACK, SEGMENT_TRACK_PILL, segmentOption } from "../motion";
import { SegmentPill } from "../segment-pill";
import { switchKnobClass, switchTrackClass } from "../ui";

/*
 * The Settings controls. Each shows its new state at once and saves behind
 * it; a save that fails puts the old state back and says so under the row,
 * rather than leaving a control that disagrees with the account.
 */

/**
 * A control's value, saved as it changes. A newer server value wins: a reload
 * the service worker paints from its cached copy draws the old value first,
 * then `CacheRefresher` re-reads the page and hands the control the account's
 * real one, which a plain `useState(initial)` would ignore (Round 10, third
 * review: a switch just turned off showed on after a reload).
 */
export function useSaved<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (JSON.stringify(seen) !== JSON.stringify(initial)) {
    setSeen(initial);
    setValue(initial);
  }
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (next: T, write: (v: T) => Promise<SaveOutcome>) => {
    const before = value;
    setValue(next);
    setError(null);
    start(async () => {
      const outcome = await write(next).catch(() => ({ ok: false as const, error: "That did not save. Try again in a moment." }));
      if (!outcome.ok) {
        setValue(before);
        setError(outcome.error);
      }
    });
  };
  return { value, error, pending, save };
}

export function Problem({ error }: { error: string | null }) {
  return error ? <span className="text-right text-[11px] text-ink-3">{error}</span> : null;
}

/** The amber switch from the mockups. Amber because on is state. */
export function Switch({
  on,
  label,
  disabled = false,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`${switchTrackClass(on)} disabled:opacity-50`}
    >
      <span className={switchKnobClass(on)} />
    </button>
  );
}

/** One of the account's push topics: friends and recommendations, the monthly challenges, or News's two (Round 10). */
export function NotifySwitch({ topic, initial, label }: { topic: NotifyTopic; initial: boolean; label: string }) {
  const { value, error, save } = useSaved(initial);
  useSettingFact(topic === "news-people" ? "newsPeople" : topic, value);
  return (
    <span className="flex flex-col items-end gap-1">
      <Switch on={value} label={label} onToggle={() => save(!value, (v) => saveNotify(topic, v))} />
      <Problem error={error} />
    </span>
  );
}

const IDLE = [0, 5, 10, 20, 30];

/** Off, or minutes without input; the same segmented control as the theme. */
export function ScreensaverPicker({ initial }: { initial: number }) {
  const { value, error, save } = useSaved(IDLE.includes(initial) ? initial : 0);
  useSettingFact("screensaver", value);
  return (
    <span className="flex flex-col items-end gap-1">
      <div role="radiogroup" aria-label="Start the screensaver after" className={SEGMENT_TRACK}>
        <SegmentPill className={SEGMENT_TRACK_PILL} />
        {IDLE.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value === m}
            data-segment=""
            data-on={value === m ? "" : undefined}
            aria-label={m ? `${m} minutes` : "Off"}
            onClick={() => value !== m && save(m, saveScreensaverIdle)}
            className={`${segmentOption} max-sm:px-2.5`}
          >
            {m ? m : "Off"}
          </button>
        ))}
      </div>
      <Problem error={error} />
    </span>
  );
}

/** The services someone pays for, as chips. Chosen is amber: it is state, what they have. */
export function ServiceChips({ services, initial }: { services: { id: number; name: string }[]; initial: number[] }) {
  const { value, error, save } = useSaved(initial);
  const chosen = new Set(value);
  useSettingFact("services", services.filter((s) => chosen.has(s.id)).map((s) => s.name));
  // Chips pressed on this visit: only their tick pops in, never the ones the page opened with.
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set());
  const toggle = (id: number) => {
    setPressed((p) => new Set(p).add(id));
    save(chosen.has(id) ? value.filter((v) => v !== id) : [...value, id], saveServices);
  };
  return (
    <div className="flex flex-col gap-1.5 pb-3 pt-1">
      <div className="flex flex-wrap gap-2">
        {services.map((s) => {
          const on = chosen.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.id)}
              className={`${PRESS} inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold ${
                on ? "border-accent bg-accent text-black" : "border-line bg-transparent text-ink-2"
              }`}
            >
              {on && <Icon name="check" size={14} className={pressed.has(s.id) ? "motion-tick-in" : ""} />}
              {s.name}
            </button>
          );
        })}
      </div>
      {error && <span className="text-[11px] text-ink-3">{error}</span>}
    </div>
  );
}

/**
 * The region, as the mockup's "Netherlands ›": a native select laid over the
 * words, so phones get their own picker and nothing has to be drawn for it.
 */
export function RegionSelect({
  options,
  initial,
  fallback,
}: {
  options: { code: string; name: string }[];
  initial: string | null;
  /** The instance's WATCH_REGION, by name: what an account with no region of its own sees. */
  fallback: string;
}) {
  const { value, error, pending, save } = useSaved(initial ?? "");
  const shown = value ? (options.find((o) => o.code === value)?.name ?? value) : fallback;
  useSettingFact("region", shown);
  useSettingFact("regionDefault", !value);
  return (
    <span className="flex flex-col items-end gap-1">
      <label className={`relative inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 ${pending ? "opacity-60" : ""}`}>
        {shown}
        <Icon name="chevR" size={14} />
        <select
          aria-label="Region"
          value={value}
          onChange={(e) => save(e.target.value, (v) => saveRegion(v || null))}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="">This Trekker&rsquo;s default ({fallback})</option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <Problem error={error} />
    </span>
  );
}

/*
 * The background (`lib/background.ts`): four previews, each the variant drawn
 * small in the current theme, the chosen one ringed in amber, and under them,
 * while Colour is chosen, its eight swatches. It changes the page at once
 * (`applyBackground`) and saves behind it; the save writes the row and this
 * browser's cookie, and a failure puts the old one back.
 */

const PREVIEW = "relative block h-12 w-[72px] overflow-hidden rounded-xl border border-line";

/** A tint of the page colour, as the page itself mixes it; `--h` is the hue. */
const TINT =
  "bg-[color-mix(in_oklab,#0b0c10_90%,hsl(var(--h)_70%_50%))] light:bg-[color-mix(in_oklab,#f2f1ee_88%,hsl(var(--h)_75%_62%))]";

function Preview({ variant, hue, poster }: { variant: BackgroundVariant; hue: number; poster: string | null }) {
  if (variant === "plain") return <span className={`${PREVIEW} bg-night light:bg-[#f2f1ee]`} />;
  if (variant === "gradient")
    return (
      <span
        className={`${PREVIEW} bg-[linear-gradient(160deg,#0b0c10_30%,#212226)] light:bg-[linear-gradient(160deg,#f2f1ee_30%,#fafaf9)]`}
      />
    );
  if (variant === "colour") return <span className={`${PREVIEW} ${TINT}`} style={{ "--h": hue } as CSSProperties} />;
  return (
    <span className={`${PREVIEW} bg-night light:bg-[#f2f1ee]`}>
      {poster && (
        // The w92 the page layer uses, so choosing it costs nothing more.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backgroundArtUrl(poster)}
          alt=""
          className="absolute -inset-2 size-[calc(100%+16px)] max-w-none object-cover opacity-45 blur-md saturate-150 light:opacity-25"
        />
      )}
    </span>
  );
}

const WORDS: Record<BackgroundVariant, string> = { plain: "Plain", gradient: "Gradient", artwork: "Artwork", colour: "Colour" };

export function BackgroundPicker({ initial, poster }: { initial: Background; poster: string | null }) {
  const { value, error, save } = useSaved(initial);
  useSettingFact("background", value.variant);

  const choose = (next: Background) => {
    if (next.variant === value.variant && next.hue === value.hue) return;
    const before = value;
    applyBackground(next);
    save(next, async (b) => {
      const outcome = await saveBackground(b.variant, b.hue).catch(() => ({ ok: false as const, error: "That did not save. Try again in a moment." }));
      if (outcome.ok) applyBackground(b, b.variant === "artwork" ? (outcome.poster ?? null) : undefined);
      else applyBackground(before);
      return outcome;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Background" className="flex flex-wrap gap-3">
        {BACKGROUND_VARIANTS.map((v) => {
          const on = value.variant === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose({ variant: v, hue: value.hue })}
              className={`${PRESS} flex flex-col items-center gap-1.5 rounded-2xl border-0 bg-transparent p-0 text-xs font-semibold ${on ? "text-ink" : "text-ink-2"}`}
            >
              <span className={`rounded-[14px] p-0.5 ring-2 ${on ? "ring-accent" : "ring-transparent"}`}>
                <Preview variant={v} hue={value.hue} poster={poster} />
              </span>
              {WORDS[v]}
            </button>
          );
        })}
      </div>
      {value.variant === "colour" && (
        <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2.5">
          {BACKGROUND_HUES.map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={value.hue === h}
              aria-label={`Hue ${h}`}
              onClick={() => choose({ variant: "colour", hue: h })}
              className={`${PRESS} size-8 rounded-full border-0 p-0 ring-2 ring-offset-2 ring-offset-bg ${value.hue === h ? "ring-accent" : "ring-transparent"}`}
              style={{ background: `hsl(${h} 70% 50%)` }}
            />
          ))}
        </div>
      )}
      <Problem error={error} />
    </div>
  );
}
