"use client";

import { CalendarClock, Ghost, Gift, Rocket, Sparkles, XCircle } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSeasonSetting } from "@/lib/season-actions";
import { SEASONS, type SeasonSetting } from "@/lib/seasons";

/**
 * TEMPORARY preview switch for the seasonal dressing, so all three costumes can
 * be looked at in any month. Delete this file, its entry in the account menu
 * and `src/lib/season-actions.ts` when the styling has been settled — nothing
 * else depends on it, and the calendar keeps working on its own.
 */
const OPTIONS: { value: SeasonSetting; label: string; icon: typeof Ghost }[] = [
  { value: "auto", label: "Follow the calendar", icon: CalendarClock },
  { value: "scifi", label: SEASONS.scifi.label, icon: Rocket },
  { value: "horror", label: SEASONS.horror.label, icon: Ghost },
  { value: "holiday", label: SEASONS.holiday.label, icon: Gift },
  { value: "off", label: "No dressing", icon: XCircle },
];

export function SeasonSwitcher({
  current,
  onPicked,
}: {
  current: SeasonSetting;
  /** Lets the account menu close itself once a choice has landed. */
  onPicked?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function pick(value: SeasonSetting) {
    startTransition(async () => {
      // The season is resolved in the root layout, so the whole tree has to be
      // asked for again — there is no client-side state to flip.
      await saveSeasonSetting(value);
      router.refresh();
      onPicked?.();
    });
  }

  return (
    <div className="border-t border-ink-800 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-ink-500 uppercase">
        <Sparkles size={12} />
        Seasonal look
        <span className="ml-auto text-[9px] normal-case opacity-70">temporary</span>
      </p>

      <div role="radiogroup" aria-label="Seasonal look" className="mt-1.5 space-y-0.5">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => pick(value)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition disabled:opacity-60 ${
                active
                  ? "bg-flare-600/20 text-flare-300 light:text-flare-600"
                  : "text-ink-300 hover:bg-ink-800 hover:text-ink-100"
              }`}
            >
              <Icon size={14} />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
