import type { ReactNode } from "react";
import { Icon } from "./icon";
import { foldChevron, PRESS, ROW_WASH } from "./motion";
import { EXIT, usePresence } from "./presence";
import { switchKnobClass, switchTrackClass } from "./ui";

/*
 * The controls the smart list editor and Discover's filter page share: the
 * small chip, the folded section that says on its closed header what it
 * holds, the two-handled slider, and the switch row. Rendered only inside
 * client components, which own the state they report.
 */

export const smallChip = (on: boolean) =>
  `inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-0 px-3.5 text-[13px] font-semibold ${PRESS} ${
    on ? "bg-primary text-on-primary" : "bg-surface text-ink shadow-elevation hover:bg-surface-2"
  }`;

export function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * One folded section: its label, what it holds, and the chevron that opens it.
 * The body unfolds and folds (`motion-fold`): its row grows from nothing over
 * `--base` and its contents fade in a beat behind, so the rows under it slide
 * rather than jump; it stays mounted until it has folded away. The chevron
 * turns 180° with it (`foldChevron`).
 */
export function FoldRow({ label, value, open, onToggle, children }: { label: string; value: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const { mounted, state } = usePresence(open, EXIT.base);
  return (
    <div className="flex flex-col border-b border-line py-3">
      <button type="button" aria-expanded={open} onClick={onToggle} className={`flex items-center gap-2.5 border-0 bg-transparent p-0 text-left text-ink ${ROW_WASH}`}>
        <span className="w-24 shrink-0 text-sm font-semibold">{label}</span>
        <span className="min-w-0 grow truncate text-[13px] text-ink-2">{value}</span>
        <span className="inline-flex text-ink-3">
          <Icon name="chevR" size={16} className={foldChevron(open)} />
        </span>
      </button>
      {mounted && (
        <div data-state={state} className="motion-fold grid grid-rows-[1fr]">
          <div className="min-h-0">
            <div className="flex flex-col gap-2 pl-[106px] pt-2.5">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const THUMB =
  "pointer-events-none absolute inset-0 m-0 h-5 w-full appearance-none bg-transparent outline-none " +
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.4)] " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.4)] " +
  "focus-visible:[&::-webkit-slider-thumb]:shadow-[0_0_0_3px_var(--accent)]";

/**
 * Two handles on one track, the amber between them. Two native range inputs
 * laid over each other, so keyboards and screen readers get real sliders; the
 * handles cannot cross, since a minimum above its maximum matches nothing.
 */
export function RangeSlider({
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: [number, number];
  format: (n: number) => string;
  onChange: (v: [number, number]) => void;
}) {
  const [lo, hi] = value;
  const pct = (n: number) => ((n - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between">
        <span className="mono-label">{label}</span>
        <span className="mono-label text-accent-text">
          {format(lo)} – {format(hi)}
        </span>
      </div>
      <div className="relative h-5">
        <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-[3px] bg-surface-2" />
        {/* Inset by half a handle, which is where a native thumb's centre stops at either end. */}
        <span className="absolute inset-x-2.5 top-1/2 h-1.5 -translate-y-1/2">
          <span className="absolute inset-y-0 rounded-[3px] bg-accent" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        </span>
        <input
          type="range"
          aria-label={`Lowest ${label.toLowerCase()}`}
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          className={THUMB}
        />
        <input
          type="range"
          aria-label={`Highest ${label.toLowerCase()}`}
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          className={THUMB}
        />
      </div>
    </div>
  );
}

export function ToggleRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-line py-2">
      {hint ? (
        <span className="flex grow flex-col gap-0.5">
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-xs leading-[1.4] text-ink-3">{hint}</span>
        </span>
      ) : (
        <span className="grow text-sm font-semibold">{label}</span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={switchTrackClass(on)}
      >
        <span className={switchKnobClass(on)} />
      </button>
    </label>
  );
}
