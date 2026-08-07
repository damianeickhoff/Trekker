import Image from "next/image";
import Link from "next/link";
import { CalendarHeart, Film, Tv } from "lucide-react";
import type { OnThisDayEntry } from "@/lib/heatmap";
import { img } from "@/lib/tmdb";

/**
 * "This time last year…" — the one bit of the home page that looks backwards.
 *
 * Renders nothing when there is nothing, rather than an empty state: most days
 * have no answer, and a card that spends the year saying "nothing today" is
 * worse than one that turns up occasionally with something worth seeing.
 */
export function OnThisDay({ entries }: { entries: OnThisDayEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className="mt-10">
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-flare-400 uppercase">
        <CalendarHeart size={13} />
        On this day
      </p>
      <h2 className="mt-0.5 mb-3 text-lg font-semibold tracking-tight">
        What you were watching
      </h2>

      <div className="flex flex-wrap gap-3">
        {entries.map((entry) => {
          const poster = img.poster(entry.poster);
          const Icon = entry.subtitle === "Movie" ? Film : Tv;

          return (
            <Link
              key={entry.key}
              href={entry.href}
              title={entry.title}
              className="card group flex w-[220px] grow items-center gap-3 p-2.5 transition hover:border-flare-500/40 hover:bg-ink-800/30"
            >
              <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md border border-ink-700/60 bg-ink-800">
                {poster ? (
                  <Image src={poster} alt="" fill sizes="44px" className="object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-ink-600">
                    <Icon size={16} />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-medium text-flare-400">
                  {entry.yearsAgo} year{entry.yearsAgo === 1 ? "" : "s"} ago
                </p>
                <p className="line-clamp-1 text-sm font-medium text-ink-100">{entry.title}</p>
                <p className="line-clamp-1 text-xs text-ink-400">{entry.subtitle}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
